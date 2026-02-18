"use server";

import { getOctokit } from "@/lib/github";

export type ReactionUser = {
  login: string;
  content: string;
};

export async function getReactionUsers(
  owner: string,
  repo: string,
  contentType: "issue" | "issueComment",
  contentId: number
): Promise<{ users: ReactionUser[]; error?: string }> {
  const octokit = await getOctokit();
  if (!octokit) return { users: [], error: "Not authenticated" };

  try {
    let data: any[];
    if (contentType === "issue") {
      const res = await octokit.reactions.listForIssue({
        owner,
        repo,
        issue_number: contentId,
        per_page: 100,
      });
      data = res.data;
    } else {
      const res = await octokit.reactions.listForIssueComment({
        owner,
        repo,
        comment_id: contentId,
        per_page: 100,
      });
      data = res.data;
    }

    return {
      users: data.map((r: any) => ({
        login: r.user?.login ?? "unknown",
        content: r.content,
      })),
    };
  } catch (e: any) {
    return { users: [], error: e.message || "Failed to fetch reactions" };
  }
}
