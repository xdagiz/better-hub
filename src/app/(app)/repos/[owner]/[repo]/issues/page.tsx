import { getRepoIssues, searchIssues } from "@/lib/github";
import { IssuesList } from "@/components/issue/issues-list";
import { fetchIssuesByAuthor } from "./actions";

export default async function IssuesListPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const [openIssues, closedIssues, openCount, closedCount] = await Promise.all([
    getRepoIssues(owner, repo, "open"),
    getRepoIssues(owner, repo, "closed"),
    searchIssues(`is:issue is:open repo:${owner}/${repo}`, 1),
    searchIssues(`is:issue is:closed repo:${owner}/${repo}`, 1),
  ]);

  return (
    <IssuesList
      owner={owner}
      repo={repo}
      openIssues={openIssues as any}
      closedIssues={closedIssues as any}
      openCount={openCount.total_count}
      closedCount={closedCount.total_count}
      onAuthorFilter={fetchIssuesByAuthor as any}
    />
  );
}
