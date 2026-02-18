"use server";

import { getOctokit } from "@/lib/github";

export async function fetchPRsByAuthor(
  owner: string,
  repo: string,
  author: string
) {
  const octokit = await getOctokit();
  if (!octokit) return { open: [], closed: [] };

  const [openRes, closedRes] = await Promise.all([
    octokit.search.issuesAndPullRequests({
      q: `is:pr is:open repo:${owner}/${repo} author:${author}`,
      per_page: 100,
      sort: "updated",
      order: "desc",
    }),
    octokit.search.issuesAndPullRequests({
      q: `is:pr is:closed repo:${owner}/${repo} author:${author}`,
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
