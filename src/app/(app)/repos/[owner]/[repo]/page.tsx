import {
  getRepo,
  getRepoIssues,
  getRepoPullRequests,
  getRepoNavCounts,
  getCommitActivity,
  getAuthenticatedUser,
  getUserEvents,
  getRepoEvents,
  getRepoReadme,
  getRepoContributors,
  getLanguages,
  extractRepoPermissions,
} from "@/lib/github";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { TrackView } from "@/components/shared/track-view";
import { RepoOverview } from "@/components/repo/repo-overview";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const repoData = await getRepo(owner, repo);
  if (!repoData) return null;

  const permissions = extractRepoPermissions(repoData);
  const isMaintainer = permissions.push || permissions.admin || permissions.maintain;

  // Shared data
  const [openPRs, allIssues, navCounts] = await Promise.all([
    getRepoPullRequests(owner, repo, "open"),
    getRepoIssues(owner, repo, "open"),
    getRepoNavCounts(owner, repo, repoData.open_issues_count ?? 0),
  ]);

  // Filter out PRs from issues list (GitHub API returns PRs in issues endpoint)
  const openIssues = allIssues.filter((item) => !(item as { pull_request?: unknown }).pull_request);

  if (isMaintainer) {
    // Maintainer: fetch commit activity + repo events + user events
    const currentUser = await getAuthenticatedUser();
    const [commitActivity, repoEvents, userEvents] = await Promise.all([
      getCommitActivity(owner, repo),
      getRepoEvents(owner, repo, 30),
      currentUser ? getUserEvents(currentUser.login, 100) : Promise.resolve([]),
    ]);

    // Filter user events to this repo
    const repoFullName = `${owner}/${repo}`;
    const myRepoEvents = (userEvents as Array<{ type: string; actor: { login: string; avatar_url: string } | null; created_at: string; repo?: { name: string }; payload?: Record<string, unknown> }>).filter(
      (e) => e.repo?.name === repoFullName
    );

    return (
      <div className="flex flex-col flex-1 min-h-0">
        <TrackView
          type="repo"
          url={`/${owner}/${repo}`}
          title={`${owner}/${repo}`}
          subtitle={repoData.description || "No description"}
          image={repoData.owner.avatar_url}
        />
        <RepoOverview
          owner={owner}
          repo={repo}
          repoData={repoData as unknown as Parameters<typeof RepoOverview>[0]["repoData"]}
          isMaintainer={true}
          openPRs={openPRs as unknown as Parameters<typeof RepoOverview>[0]["openPRs"]}
          openIssues={openIssues as unknown as Parameters<typeof RepoOverview>[0]["openIssues"]}
          openPRCount={navCounts.openPrs}
          openIssueCount={navCounts.openIssues}
          commitActivity={commitActivity}
          repoEvents={repoEvents as Array<{ type: string; actor: { login: string; avatar_url: string } | null; created_at: string; repo?: { name: string }; payload?: { action?: string; ref?: string; ref_type?: string; commits?: { sha: string; message: string }[]; pull_request?: { number: number; title: string }; issue?: { number: number; title: string }; comment?: { body: string }; forkee?: { full_name: string }; release?: { tag_name: string; name: string } } }>}
          myRepoEvents={myRepoEvents}
        />
      </div>
    );
  }

  // Non-maintainer: fetch readme, contributors, languages
  const [readmeData, contributorsData, languages] = await Promise.all([
    getRepoReadme(owner, repo, repoData.default_branch),
    getRepoContributors(owner, repo, 10),
    getLanguages(owner, repo),
  ]);

  const readmeSlot = readmeData ? (
    <MarkdownRenderer
      content={readmeData.content}
      repoContext={{ owner, repo, branch: repoData.default_branch }}
    />
  ) : null;

  return (
    <div>
      <TrackView
        type="repo"
        url={`/${owner}/${repo}`}
        title={`${owner}/${repo}`}
        subtitle={repoData.description || "No description"}
        image={repoData.owner.avatar_url}
      />
      <RepoOverview
        owner={owner}
        repo={repo}
        repoData={repoData as unknown as Parameters<typeof RepoOverview>[0]["repoData"]}
        isMaintainer={false}
        openPRs={openPRs as unknown as Parameters<typeof RepoOverview>[0]["openPRs"]}
        openIssues={openIssues as unknown as Parameters<typeof RepoOverview>[0]["openIssues"]}
        openPRCount={navCounts.openPrs}
        openIssueCount={navCounts.openIssues}
        readmeSlot={readmeSlot}
        contributors={contributorsData.list}
        languages={languages}
      />
    </div>
  );
}
