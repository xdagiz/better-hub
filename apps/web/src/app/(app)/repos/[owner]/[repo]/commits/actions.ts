"use server";

import { getRepoCommits } from "@/lib/github";

export async function fetchCommitsByDate(
	owner: string,
	repo: string,
	since?: string,
	until?: string,
	branch?: string,
) {
	return getRepoCommits(
		owner,
		repo,
		branch || undefined,
		1,
		30,
		since || undefined,
		until || undefined,
	);
}

export async function fetchLatestCommit(owner: string, repo: string) {
	const commits = await getRepoCommits(owner, repo, undefined, 1, 1);
	const c = commits[0];
	if (!c) return null;
	return {
		sha: c.sha,
		message: (c.commit.message ?? "").split("\n")[0],
		date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
		author: c.author
			? { login: c.author.login, avatarUrl: c.author.avatar_url }
			: c.commit.author?.name
				? { login: c.commit.author.name, avatarUrl: "" }
				: null,
	};
}
