"use server";

import { getRepoCommits } from "@/lib/github";

export async function fetchCommitsByDate(
  owner: string,
  repo: string,
  since?: string,
  until?: string
) {
  return getRepoCommits(
    owner,
    repo,
    undefined,
    1,
    30,
    since || undefined,
    until || undefined
  );
}
