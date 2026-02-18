"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function deleteBranch(
  owner: string,
  repo: string,
  branch: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { success: false };
  try {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
    revalidatePath(`/repos/${owner}/${repo}`);
    return { success: true };
  } catch {
    return { success: false };
  }
}
