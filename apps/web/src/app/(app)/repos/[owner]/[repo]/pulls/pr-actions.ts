"use server";

import {
	getOctokit,
	getGitHubToken,
	getAuthenticatedUser,
	invalidatePullRequestCache,
	getRepoBranches,
	getUser,
	getUserPublicRepos,
	getUserPublicOrgs,
	getPersonRepoActivity,
	getRepoContributors,
	type PersonRepoActivity,
} from "@/lib/github";
import { computeContributorScore } from "@/lib/contributor-score";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { all } from "better-all";

export async function fetchBranchNames(owner: string, repo: string) {
	try {
		const branches = await getRepoBranches(owner, repo);
		return (branches || []).map((b: { name: string }) => b.name);
	} catch {
		return [];
	}
}

export async function updatePRBaseBranch(
	owner: string,
	repo: string,
	pullNumber: number,
	base: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.pulls.update({
			owner,
			repo,
			pull_number: pullNumber,
			base,
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to update base branch" };
	}
}

export async function renamePullRequest(
	owner: string,
	repo: string,
	pullNumber: number,
	title: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.pulls.update({
			owner,
			repo,
			pull_number: pullNumber,
			title,
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to rename" };
	}
}

export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePullRequest(
	owner: string,
	repo: string,
	pullNumber: number,
	method: MergeMethod,
	commitTitle?: string,
	commitMessage?: string,
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
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to merge" };
	}
}

export async function closePullRequest(owner: string, repo: string, pullNumber: number) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.pulls.update({
			owner,
			repo,
			pull_number: pullNumber,
			state: "closed",
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to close" };
	}
}

export async function reopenPullRequest(owner: string, repo: string, pullNumber: number) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.pulls.update({
			owner,
			repo,
			pull_number: pullNumber,
			state: "open",
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to reopen" };
	}
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export async function submitPRReview(
	owner: string,
	repo: string,
	pullNumber: number,
	event: ReviewEvent,
	body?: string,
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
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to submit review" };
	}
}

export async function addPRComment(owner: string, repo: string, pullNumber: number, body: string) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.issues.createComment({
			owner,
			repo,
			issue_number: pullNumber,
			body,
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to add comment" };
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
	startSide?: "LEFT" | "RIGHT",
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		const params: Parameters<typeof octokit.pulls.createReviewComment>[0] = {
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
		await octokit.pulls.createReviewComment(params);
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to add review comment" };
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
	commitMessage?: string,
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
			(fileData as { content: string }).content,
			"base64",
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
			sha: (fileData as { sha: string }).sha,
			branch,
		});

		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to commit suggestion" };
	}
}

export async function commitFileEditOnPR(
	owner: string,
	repo: string,
	pullNumber: number,
	path: string,
	branch: string,
	content: string,
	sha: string,
	commitMessage: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		const { data } = await octokit.repos.createOrUpdateFileContents({
			owner,
			repo,
			path,
			message: commitMessage,
			content: Buffer.from(content).toString("base64"),
			sha,
			branch,
		});
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true, newSha: data.content?.sha };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to commit file edit" };
	}
}

export async function resolveReviewThread(
	threadId: string,
	owner: string,
	repo: string,
	pullNumber: number,
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
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to resolve thread" };
	}
}

export async function unresolveReviewThread(
	threadId: string,
	owner: string,
	repo: string,
	pullNumber: number,
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
		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to unresolve thread" };
	}
}

export async function commitMergeConflictResolution(
	owner: string,
	repo: string,
	pullNumber: number,
	headBranch: string,
	baseBranch: string,
	resolvedFiles: { path: string; content: string }[],
	commitMessage?: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		// 1. Get HEAD SHAs of both branches
		const [headRef, baseRef] = await Promise.all([
			octokit.git.getRef({ owner, repo, ref: `heads/${headBranch}` }),
			octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` }),
		]);
		const headSha = headRef.data.object.sha;
		const baseSha = baseRef.data.object.sha;

		// 2. Get head commit's tree as base
		const { data: headCommit } = await octokit.git.getCommit({
			owner,
			repo,
			commit_sha: headSha,
		});

		// 3. Create blobs for resolved files
		const treeEntries = await Promise.all(
			resolvedFiles.map(async (file) => {
				const { data: blob } = await octokit.git.createBlob({
					owner,
					repo,
					content: Buffer.from(file.content).toString("base64"),
					encoding: "base64",
				});
				return {
					path: file.path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.sha,
				};
			}),
		);

		// 4. Create new tree based on head's tree
		const { data: newTree } = await octokit.git.createTree({
			owner,
			repo,
			base_tree: headCommit.tree.sha,
			tree: treeEntries,
		});

		// 5. Create merge commit with two parents: [headSha, baseSha]
		const message = commitMessage || `Merge branch '${baseBranch}' into ${headBranch}`;
		const user = await getAuthenticatedUser();
		const { data: mergeCommit } = await octokit.git.createCommit({
			owner,
			repo,
			message,
			tree: newTree.sha,
			parents: [headSha, baseSha],
			...(user
				? {
						author: {
							name:
								(
									user as {
										name?: string;
										login?: string;
									}
								).name ||
								(user as { login?: string })
									.login ||
								"User",
							email:
								(user as { email?: string })
									.email ||
								`${(user as { login?: string }).login}@users.noreply.github.com`,
							date: new Date().toISOString(),
						},
					}
				: {}),
		});

		// 6. Update head branch ref to point to merge commit
		await octokit.git.updateRef({
			owner,
			repo,
			ref: `heads/${headBranch}`,
			sha: mergeCommit.sha,
		});

		await invalidatePullRequestCache(owner, repo, pullNumber);
		revalidatePath(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		return { success: true, mergeCommitSha: mergeCommit.sha };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to commit merge resolution" };
	}
}

const DOSSIER_TIMEOUT_MS = 8_000;

export async function fetchAuthorDossier(
	owner: string,
	repo: string,
	authorLogin: string,
) {
	try {
		const result = await Promise.race([
			all({
				authorProfile: () => getUser(authorLogin),
				authorRepos: () => getUserPublicRepos(authorLogin, 6),
				authorOrgs: () => getUserPublicOrgs(authorLogin),
				authorActivity: () => getPersonRepoActivity(owner, repo, authorLogin),
				contributors: () => getRepoContributors(owner, repo),
			}),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("Author dossier timed out")), DOSSIER_TIMEOUT_MS),
			),
		]);

		const { authorProfile, authorRepos, authorOrgs, authorActivity, contributors } = result;

		if (!authorProfile) return null;

		const orgs = (authorOrgs ?? []) as { login: string; avatar_url: string }[];
		const repos = (authorRepos ?? []) as {
			name: string;
			full_name: string;
			stargazers_count: number;
			language: string | null;
		}[];
		const activity = authorActivity as PersonRepoActivity;

		const isOrgMember = orgs.some(
			(o) => o.login?.toLowerCase() === owner.toLowerCase(),
		);
		const contributorEntry = contributors.list?.find(
			(c) => c.login?.toLowerCase() === authorLogin.toLowerCase(),
		);
		const sortedRepos = [...repos]
			.sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
			.slice(0, 6);

		const profile = authorProfile as {
			followers: number;
			public_repos: number;
			created_at: string;
		};
		const score = computeContributorScore({
			followers: profile.followers ?? 0,
			publicRepos: profile.public_repos ?? 0,
			accountCreated: profile.created_at ?? "",
			commitsInRepo: activity.commits?.length ?? 0,
			prsInRepo: (activity.prs ?? []).map((p) => ({ state: p.state })),
			reviewsInRepo: activity.reviews?.length ?? 0,
			isContributor: !!contributorEntry,
			contributionCount: contributorEntry?.contributions ?? 0,
			isOrgMember,
			isOwner: authorLogin.toLowerCase() === owner.toLowerCase(),
			topRepoStars: sortedRepos.map((r) => r.stargazers_count ?? 0),
		});

		return {
			author: authorProfile,
			orgs: orgs.map((o) => ({ login: o.login, avatar_url: o.avatar_url })),
			topRepos: sortedRepos.slice(0, 3).map((r) => ({
				name: r.name,
				full_name: r.full_name,
				stargazers_count: r.stargazers_count ?? 0,
				language: r.language,
			})),
			isOrgMember,
			score,
			contributionCount: contributorEntry?.contributions ?? 0,
			repoActivity: {
				commits: activity.commits?.length ?? 0,
				prs: activity.prs?.length ?? 0,
				reviews: activity.reviews?.length ?? 0,
				issues: activity.issues?.length ?? 0,
			},
		};
	} catch {
		return null;
	}
}
