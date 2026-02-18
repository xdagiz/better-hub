"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || "Failed to add comment" };
  }
}
