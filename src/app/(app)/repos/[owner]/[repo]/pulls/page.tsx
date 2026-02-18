import { getRepoPullRequests, searchIssues, enrichPRsWithStats } from "@/lib/github";
import { PRsList } from "@/components/pr/prs-list";
import { fetchPRsByAuthor } from "./actions";

export default async function PullsListPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const [openPRs, closedPRs, openCount, closedCount] = await Promise.all([
    getRepoPullRequests(owner, repo, "open"),
    getRepoPullRequests(owner, repo, "closed"),
    searchIssues(`is:pr is:open repo:${owner}/${repo}`, 1),
    searchIssues(`is:pr is:closed repo:${owner}/${repo}`, 1),
  ]);

  const allPRs = [...openPRs, ...closedPRs];
  const statsMap = await enrichPRsWithStats(owner, repo, allPRs);

  const enrich = (prs: typeof openPRs) =>
    prs.map((pr) => {
      const stats = statsMap.get(pr.number);
      return stats ? { ...pr, ...stats } : pr;
    });

  return (
    <PRsList
      owner={owner}
      repo={repo}
      openPRs={enrich(openPRs) as any}
      closedPRs={enrich(closedPRs) as any}
      openCount={openCount.total_count}
      closedCount={closedCount.total_count}
      onAuthorFilter={fetchPRsByAuthor as any}
    />
  );
}
