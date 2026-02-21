import { getRepoPageData, type CommitActivityWeek, type CheckStatus } from "@/lib/github";
import { TrackView } from "@/components/shared/track-view";
import { RepoOverview } from "@/components/repo/repo-overview";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPinnedItems } from "@/lib/pinned-items-store";
import { getCachedReadmeHtml } from "@/lib/readme-cache";
import {
	getCachedOverviewPRs,
	getCachedOverviewIssues,
	getCachedOverviewEvents,
	getCachedOverviewCommitActivity,
	getCachedOverviewCI,
} from "@/lib/repo-data-cache";
import type { OverviewPRItem, OverviewIssueItem, OverviewRepoEvent } from "./overview-actions";

export default async function RepoPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const pageData = await getRepoPageData(owner, repo);
	if (!pageData) return null;

	const { repoData, navCounts } = pageData;
	const { permissions } = repoData;
	const isMaintainer = permissions.push || permissions.admin || permissions.maintain;

	const [cachedReadmeHtml, pinnedItems, cachedPRs, cachedIssues, cachedEvents, cachedActivity, cachedCI] =
		await Promise.all([
			isMaintainer ? Promise.resolve(null) : getCachedReadmeHtml(owner, repo),
			isMaintainer
				? auth.api
						.getSession({ headers: await headers() })
						.then((s) =>
							s?.user?.id
								? getPinnedItems(s.user.id, owner, repo)
								: [],
						)
				: Promise.resolve([]),
			isMaintainer ? getCachedOverviewPRs<OverviewPRItem>(owner, repo) : Promise.resolve(null),
			isMaintainer ? getCachedOverviewIssues<OverviewIssueItem>(owner, repo) : Promise.resolve(null),
			isMaintainer ? getCachedOverviewEvents<OverviewRepoEvent>(owner, repo) : Promise.resolve(null),
			isMaintainer ? getCachedOverviewCommitActivity<CommitActivityWeek>(owner, repo) : Promise.resolve(null),
			isMaintainer ? getCachedOverviewCI<CheckStatus>(owner, repo) : Promise.resolve(null),
		]);

	return (
		<div className={isMaintainer ? "flex flex-col flex-1 min-h-0" : undefined}>
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
				repoData={repoData}
				isMaintainer={isMaintainer}
				openPRCount={navCounts.openPrs}
				openIssueCount={navCounts.openIssues}
				defaultBranch={repoData.default_branch}
				initialReadmeHtml={cachedReadmeHtml}
				pinnedItems={pinnedItems}
				initialPRs={cachedPRs}
				initialIssues={cachedIssues}
				initialEvents={cachedEvents}
				initialCommitActivity={cachedActivity}
				initialCIStatus={cachedCI}
			/>
		</div>
	);
}
