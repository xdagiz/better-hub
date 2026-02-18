"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function fetchIssuesByAuthor(
  owner: string,
  repo: string,
  author: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { open: [], closed: [] };

  const [openRes, closedRes] = await Promise.all([
    octokit.search.issuesAndPullRequests({
      q: `is:issue is:open repo:${owner}/${repo} author:${author}`,
      per_page: 100,
      sort: "updated",
      order: "desc",
    }),
    octokit.search.issuesAndPullRequests({
      q: `is:issue is:closed repo:${owner}/${repo} author:${author}`,
      per_page: 100,
      sort: "updated",
      order: "desc",
    }),
  ]);

  return {
    open: openRes.data.items,
    closed: closedRes.data.items,
  };
}

export interface IssueTemplate {
  name: string;
  about: string;
  title: string;
  labels: string[];
  body: string;
}

export async function getIssueTemplates(
  owner: string,
  repo: string
): Promise<IssueTemplate[]> {
  const octokit = await getOctokit();
  if (!octokit) return [];

  try {
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: ".github/ISSUE_TEMPLATE",
    });

    if (!Array.isArray(contents)) return [];

    const mdFiles = contents.filter(
      (f: any) =>
        f.type === "file" &&
        (f.name.endsWith(".md") || f.name.endsWith(".yml") || f.name.endsWith(".yaml"))
    );

    const templates: IssueTemplate[] = [];

    for (const file of mdFiles) {
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path: file.path,
        });

        if ("content" in data && typeof data.content === "string") {
          const decoded = Buffer.from(data.content, "base64").toString("utf-8");
          const template = parseTemplateFrontmatter(decoded, file.name);
          if (template) templates.push(template);
        }
      } catch {
        // skip unreadable files
      }
    }

    return templates;
  } catch {
    return [];
  }
}

function parseTemplateFrontmatter(
  content: string,
  filename: string
): IssueTemplate | null {
  // Handle YAML-based templates (.yml/.yaml)
  if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
    return parseYamlTemplate(content, filename);
  }

  // Markdown templates with YAML front matter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)/);
  if (!fmMatch) {
    return {
      name: filename.replace(/\.md$/, "").replace(/[-_]/g, " "),
      about: "",
      title: "",
      labels: [],
      body: content,
    };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const name = extractYamlValue(frontmatter, "name") ||
    filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
  const about = extractYamlValue(frontmatter, "about") || "";
  const title = extractYamlValue(frontmatter, "title") || "";
  const labelsRaw = extractYamlValue(frontmatter, "labels") || "";
  const labels = labelsRaw
    ? labelsRaw
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((l) => l.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
    : [];

  return { name, about, title, labels, body };
}

function parseYamlTemplate(content: string, filename: string): IssueTemplate | null {
  const name = extractYamlValue(content, "name") ||
    filename.replace(/\.(yml|yaml)$/, "").replace(/[-_]/g, " ");
  const description = extractYamlValue(content, "description") || "";
  const title = extractYamlValue(content, "title") || "";
  const labelsRaw = extractYamlValue(content, "labels") || "";
  const labels = labelsRaw
    ? labelsRaw
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((l) => l.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
    : [];

  // Build body from form fields
  const bodyParts: string[] = [];
  const bodyMatch = content.match(/body:\s*\n([\s\S]*)/);
  if (bodyMatch) {
    const fieldMatches = bodyMatch[1].matchAll(
      /- type:\s*(\w+)[\s\S]*?(?:label:\s*["']?(.+?)["']?\s*\n)[\s\S]*?(?:description:\s*["']?(.+?)["']?\s*\n)?/g
    );
    for (const m of fieldMatches) {
      const type = m[1];
      const label = m[2]?.trim() || "";
      if (type === "markdown") continue;
      if (label) {
        bodyParts.push(`### ${label}\n\n`);
      }
    }
  }

  return {
    name,
    about: description,
    title,
    labels,
    body: bodyParts.join("\n") || "",
  };
}

function extractYamlValue(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = yaml.match(re);
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[],
  assignees: string[]
): Promise<{ success: boolean; number?: number; error?: string }> {
  const octokit = await getOctokit();
  if (!octokit) return { success: false, error: "Not authenticated" };

  try {
    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body: body || undefined,
      labels: labels.length > 0 ? labels : undefined,
      assignees: assignees.length > 0 ? assignees : undefined,
    });

    revalidatePath(`/repos/${owner}/${repo}/issues`);
    return { success: true, number: data.number };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to create issue",
    };
  }
}

export async function getRepoLabels(
  owner: string,
  repo: string
): Promise<Array<{ name: string; color: string; description: string | null }>> {
  const octokit = await getOctokit();
  if (!octokit) return [];

  try {
    const { data } = await octokit.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100,
    });
    return data.map((l) => ({
      name: l.name,
      color: l.color ?? "888888",
      description: l.description ?? null,
    }));
  } catch {
    return [];
  }
}
