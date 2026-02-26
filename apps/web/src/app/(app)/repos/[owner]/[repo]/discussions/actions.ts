"use server";

import { getRepoDiscussionsPage, fetchMoreDiscussions } from "@/lib/github";
import type { RepoDiscussionNode } from "@/lib/github";

export async function fetchDiscussionsByCategory(owner: string, repo: string, _category: string) {
	const data = await getRepoDiscussionsPage(owner, repo);
	return data;
}

export async function loadMoreDiscussions(
	owner: string,
	repo: string,
	cursor: string,
): Promise<{ discussions: RepoDiscussionNode[]; hasNextPage: boolean; endCursor: string | null }> {
	return fetchMoreDiscussions(owner, repo, cursor);
}
