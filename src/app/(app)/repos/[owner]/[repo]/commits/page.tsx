import { getRepoCommits, getRepo } from "@/lib/github";
import { CommitsList } from "@/components/repo/commits-list";

export default async function CommitsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const [repoData, commits] = await Promise.all([
    getRepo(owner, repo),
    getRepoCommits(owner, repo),
  ]);
  if (!repoData) return null;
  return (
    <CommitsList
      owner={owner}
      repo={repo}
      commits={commits as any}
      defaultBranch={repoData.default_branch}
    />
  );
}
