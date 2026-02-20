import { getRepoPullRequests, searchIssues, enrichPRsWithStats, enrichPRsWithCheckStatus } from "@/lib/github";
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
  const [statsMap, checkStatusMap] = await Promise.all([
    enrichPRsWithStats(owner, repo, allPRs),
    enrichPRsWithCheckStatus(owner, repo, openPRs),
  ]);

  const enrich = (prs: typeof openPRs) =>
    prs.map((pr) => {
      const stats = statsMap.get(pr.number);
      const checkStatus = checkStatusMap.get(pr.number);
      return { ...pr, ...(stats ?? {}), ...(checkStatus ? { checkStatus } : {}) };
    });

  return (
    <PRsList
      owner={owner}
      repo={repo}
      openPRs={enrich(openPRs) as unknown as Parameters<typeof PRsList>[0]["openPRs"]}
      closedPRs={enrich(closedPRs) as unknown as Parameters<typeof PRsList>[0]["closedPRs"]}
      openCount={openCount.total_count}
      closedCount={closedCount.total_count}
      onAuthorFilter={fetchPRsByAuthor as unknown as Parameters<typeof PRsList>[0]["onAuthorFilter"]}
    />
  );
}
