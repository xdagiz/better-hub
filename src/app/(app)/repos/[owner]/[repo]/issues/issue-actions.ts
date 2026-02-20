"use server";

import { getOctokit, invalidateIssueCache } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";
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
    await invalidateIssueCache(owner, repo, issueNumber);
    revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    return { success: true };
  } catch (e: unknown) {
    return { error: getErrorMessage(e) };
  }
}

export async function closeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  stateReason: "completed" | "not_planned",
  comment?: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    if (comment?.trim()) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment.trim(),
      });
    }
    await octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: "closed",
      state_reason: stateReason,
    });
    await invalidateIssueCache(owner, repo, issueNumber);
    revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    revalidatePath(`/repos/${owner}/${repo}/issues`);
    return { success: true };
  } catch (e: unknown) {
    return { error: getErrorMessage(e) };
  }
}

export async function reopenIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  comment?: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { error: "Not authenticated" };

  try {
    if (comment?.trim()) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment.trim(),
      });
    }
    await octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: "open",
    });
    await invalidateIssueCache(owner, repo, issueNumber);
    revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    revalidatePath(`/repos/${owner}/${repo}/issues`);
    return { success: true };
  } catch (e: unknown) {
    return { error: getErrorMessage(e) };
  }
}
