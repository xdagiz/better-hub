"use server";

import { getOctokit, getGitHubToken } from "@/lib/github";
import { revalidatePath } from "next/cache";

export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  method: MergeMethod,
  commitTitle?: string,
  commitMessage?: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: method,
      ...(commitTitle ? { commit_title: commitTitle } : {}),
      ...(commitMessage ? { commit_message: commitMessage } : {}),
    });
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to merge" };
  }
}

export async function closePullRequest(
  owner: string,
  repo: string,
  pullNumber: number
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: "closed",
    });
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to close" };
  }
}

export async function reopenPullRequest(
  owner: string,
  repo: string,
  pullNumber: number
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: "open",
    });
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to reopen" };
  }
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export async function submitPRReview(
  owner: string,
  repo: string,
  pullNumber: number,
  event: ReviewEvent,
  body?: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event,
      ...(body ? { body } : {}),
    });
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to submit review" };
  }
}

export async function addPRComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to add comment" };
  }
}

export async function addPRReviewComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  commitId: string,
  path: string,
  line: number,
  side: "LEFT" | "RIGHT",
  startLine?: number,
  startSide?: "LEFT" | "RIGHT"
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    const params: Record<string, any> = {
      owner,
      repo,
      pull_number: pullNumber,
      body,
      commit_id: commitId,
      path,
      line,
      side,
    };
    if (startLine !== undefined && startLine !== line) {
      params.start_line = startLine;
      params.start_side = startSide || side;
    }
    await octokit.pulls.createReviewComment(params as any);
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to add review comment" };
  }
}

export async function commitSuggestion(
  owner: string,
  repo: string,
  pullNumber: number,
  path: string,
  branch: string,
  startLine: number,
  endLine: number,
  suggestion: string,
  commitMessage?: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(fileData) || fileData.type !== "file") {
      return { error: "Not a file" };
    }

    const content = Buffer.from(
      (fileData as any).content,
      "base64"
    ).toString("utf-8");
    const lines = content.split("\n");

    // Replace lines (1-indexed)
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const suggestionLines = suggestion.length > 0 ? suggestion.split("\n") : [];
    const newContent = [...before, ...suggestionLines, ...after].join("\n");

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message:
        commitMessage ||
        `Apply suggestion to ${path} (lines ${startLine}-${endLine})`,
      content: Buffer.from(newContent).toString("base64"),
      sha: (fileData as any).sha,
      branch,
    });

    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to commit suggestion" };
  }
}

export async function resolveReviewThread(
  threadId: string,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const token = await getGitHubToken();
  if (!token) return { error: "Not authenticated" };

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread { id isResolved }
          }
        }`,
        variables: { threadId },
      }),
    });
    const json = await response.json();
    if (json.errors?.length) {
      return { error: json.errors[0].message };
    }
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to resolve thread" };
  }
}

export async function unresolveReviewThread(
  threadId: string,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const token = await getGitHubToken();
  if (!token) return { error: "Not authenticated" };

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation($threadId: ID!) {
          unresolveReviewThread(input: { threadId: $threadId }) {
            thread { id isResolved }
          }
        }`,
        variables: { threadId },
      }),
    });
    const json = await response.json();
    if (json.errors?.length) {
      return { error: json.errors[0].message };
    }
    revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to unresolve thread" };
  }
}
