import {
  getPullRequest,
  getPullRequestFiles,
  getPullRequestComments,
  getPullRequestReviews,
  getPullRequestReviewThreads,
  getPullRequestCommits,
  getRepo,
  getAuthenticatedUser,
  extractRepoPermissions,
  getOctokit,
  fetchCheckStatusForRef,
  type CheckStatus,
} from "@/lib/github";
import { extractParticipants } from "@/lib/github-utils";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";
import { PRHeader } from "@/components/pr/pr-header";
import { PRDiffViewer } from "@/components/pr/pr-diff-viewer";
import { PRDetailLayout } from "@/components/pr/pr-detail-layout";
import {
  PRConversation,
  type TimelineEntry,
  type ReviewCommentEntry,
} from "@/components/pr/pr-conversation";
import { PRMergePanel } from "@/components/pr/pr-merge-panel";
import { PRCommentForm } from "@/components/pr/pr-comment-form";
import { PRReviewForm } from "@/components/pr/pr-review-form";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { TrackView } from "@/components/shared/track-view";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/lib/inngest";

export default async function PRDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number: numStr } = await params;
  const pullNumber = parseInt(numStr, 10);

  const [pr, files, comments, reviews, threads, commits, repoData, currentUser] = await Promise.all([
    getPullRequest(owner, repo, pullNumber),
    getPullRequestFiles(owner, repo, pullNumber),
    getPullRequestComments(owner, repo, pullNumber),
    getPullRequestReviews(owner, repo, pullNumber),
    getPullRequestReviewThreads(owner, repo, pullNumber),
    getPullRequestCommits(owner, repo, pullNumber),
    getRepo(owner, repo),
    getAuthenticatedUser(),
  ]);

  const permissions = extractRepoPermissions(repoData);
  const canWrite = permissions.push || permissions.admin || permissions.maintain;
  const canTriage = canWrite || permissions.triage;

  // Fetch check status for open PRs
  let checkStatus: CheckStatus | undefined;
  if (pr && pr.state === "open" && !pr.merged_at) {
    try {
      const octokit = await getOctokit();
      const cs = await fetchCheckStatusForRef(octokit, owner, repo, pr.head.sha);
      if (cs) checkStatus = cs;
    } catch {
      // Ignore check status errors
    }
  }

  // Fetch session unconditionally (used for embedding trigger)
  const session = await auth.api.getSession({ headers: await headers() });

  if (!pr) {
    return (
      <div className="py-16 text-center">
        <p className="text-xs text-muted-foreground font-mono">
          Pull request not found
        </p>
      </div>
    );
  }

  // Fire-and-forget: embed PR content for semantic search
  if (session?.user?.id) {
    void inngest.send({
      name: "app/content.viewed",
      data: {
        userId: session.user.id,
        contentType: "pr",
        owner,
        repo,
        number: pullNumber,
        title: pr.title,
        body: pr.body ?? "",
        comments: comments.issueComments
          .filter((c: any) => c.body)
          .map((c: any) => ({
            id: c.id,
            body: c.body,
            author: c.user?.login ?? "unknown",
            createdAt: c.created_at,
          })),
        reviews: reviews
          .filter((r) => r.body)
          .map((r) => ({
            id: r.id,
            body: r.body!,
            author: r.user?.login ?? "unknown",
            state: r.state,
            createdAt: r.submitted_at ?? "",
          })),
      },
    });
  }

  // Group review comments by pull_request_review_id
  const reviewCommentsByReviewId = new Map<number, ReviewCommentEntry[]>();
  for (const rc of comments.reviewComments) {
    const reviewId = (rc as any).pull_request_review_id as number | undefined;
    if (reviewId) {
      const existing = reviewCommentsByReviewId.get(reviewId) || [];
      existing.push({
        id: rc.id,
        user: rc.user
          ? { login: rc.user.login, avatar_url: rc.user.avatar_url }
          : null,
        body: rc.body || "",
        path: (rc as any).path || "",
        line: (rc as any).line ?? (rc as any).original_line ?? null,
        created_at: rc.created_at,
      });
      reviewCommentsByReviewId.set(reviewId, existing);
    }
  }

  // Build unified timeline
  const timeline: TimelineEntry[] = [];

  timeline.push({
    type: "description",
    id: `pr-body-${pr.number}`,
    user: pr.user
      ? { login: pr.user.login, avatar_url: pr.user.avatar_url }
      : null,
    body: pr.body || "",
    created_at: pr.created_at,
    reactions: (pr as any).reactions ?? undefined,
  });

  for (const c of comments.issueComments) {
    timeline.push({
      type: "comment",
      id: c.id,
      user: c.user
        ? { login: c.user.login, avatar_url: c.user.avatar_url }
        : null,
      body: c.body || "",
      created_at: c.created_at,
      author_association: (c as any).author_association,
      reactions: (c as any).reactions ?? undefined,
    });
  }

  for (const r of reviews) {
    timeline.push({
      type: "review",
      id: r.id,
      user: r.user
        ? { login: r.user.login, avatar_url: r.user.avatar_url }
        : null,
      body: r.body || null,
      state: r.state,
      created_at: (r as any).created_at || r.submitted_at || "",
      submitted_at: r.submitted_at || null,
      comments: reviewCommentsByReviewId.get(r.id) || [],
    });
  }

  for (const c of commits) {
    const commitAuthor = (c as any).author;
    const commitData = (c as any).commit;
    timeline.push({
      type: "commit" as const,
      id: (c as any).sha as string,
      sha: (c as any).sha as string,
      message: commitData?.message || "",
      user: commitAuthor
        ? { login: commitAuthor.login, avatar_url: commitAuthor.avatar_url }
        : null,
      committer_name: commitData?.author?.name || commitData?.committer?.name || null,
      created_at: commitData?.author?.date || commitData?.committer?.date || "",
    } as any);
  }

  timeline.sort((a, b) => {
    if (a.type === "description") return -1;
    if (b.type === "description") return 1;
    const dateA =
      a.type === "review" ? a.submitted_at || a.created_at : a.created_at;
    const dateB =
      b.type === "review" ? b.submitted_at || b.created_at : b.created_at;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // Pre-highlight diff lines with Shiki
  const highlightData: Record<string, Record<string, SyntaxToken[]>> = {};
  if (files && files.length > 0) {
    await Promise.all(
      (files as any[]).map(async (file: any) => {
        if (file.patch) {
          try {
            highlightData[file.filename] = await highlightDiffLines(file.patch, file.filename);
          } catch (err) {
            console.error(`[highlight-debug] error highlighting ${file.filename}:`, err);
          }
        }
      })
    );
  }

  // DEBUG: verify highlight data is populated
  const hlFileCount = Object.keys(highlightData).length;
  const hlSample = Object.entries(highlightData)[0];
  console.log(`[highlight-debug] files=${hlFileCount}, sample=${hlSample ? hlSample[0] + ' keys=' + Object.keys(hlSample[1]).length : 'none'}`);
  if (hlSample) {
    const sampleTokens = Object.values(hlSample[1])[0];
    if (sampleTokens?.[0]) {
      console.log(`[highlight-debug] first token: text="${sampleTokens[0].text}" light="${sampleTokens[0].lightColor}" dark="${sampleTokens[0].darkColor}"`);
    }
  }

  const isOpen = pr.state === "open" && !pr.merged_at;
  const headSha = pr.head.sha;
  const headBranch = pr.head.ref;

  // Build review summaries for reviews panel
  const reviewSummaries = reviews.map((r) => ({
    id: r.id,
    user: r.user
      ? { login: r.user.login, avatar_url: r.user.avatar_url }
      : null,
    state: r.state,
    submitted_at: r.submitted_at || null,
  }));

  // Compute latest review state per user (for approval indicators)
  const latestReviewByUser = new Map<string, { login: string; avatar_url: string; state: string }>();
  for (const r of reviews) {
    if (!r.user || r.state === "PENDING" || r.state === "COMMENTED") continue;
    latestReviewByUser.set(r.user.login, {
      login: r.user.login,
      avatar_url: r.user.avatar_url,
      state: r.state,
    });
  }
  const reviewStatuses = Array.from(latestReviewByUser.values());

  // Extract participants for @mention autocomplete
  const participants = extractParticipants([
    pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
    ...comments.issueComments.map((c: any) =>
      c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null
    ),
    ...comments.reviewComments.map((c: any) =>
      c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null
    ),
    ...reviews.map((r) =>
      r.user ? { login: r.user.login, avatar_url: r.user.avatar_url } : null
    ),
  ]);

  return (
    <>
    <TrackView
      type="pr"
      url={`/${owner}/${repo}/pulls/${pullNumber}`}
      title={pr.title}
      subtitle={`${owner}/${repo}`}
      number={pullNumber}
      state={pr.merged_at ? "merged" : pr.state}
    />
    <PRDetailLayout
      commentCount={comments.issueComments.length}
      fileCount={files?.length || 0}
      hasReviews={reviews.some((r) => r.state !== "PENDING")}
      infoBar={
        <>
          <PRHeader
            title={pr.title}
            number={pr.number}
            state={pr.state}
            merged={!!pr.merged_at}
            draft={pr.draft || false}
            author={pr.user}
            createdAt={pr.created_at}
            baseBranch={pr.base.ref}
            headBranch={pr.head.ref}
            additions={pr.additions}
            deletions={pr.deletions}
            changedFiles={pr.changed_files}
            labels={(pr.labels || []).map((l) =>
              typeof l === "string" ? { name: l } : l
            )}
            reviewStatuses={reviewStatuses}
            checkStatus={checkStatus}
            owner={owner}
            repo={repo}
            canEdit={canWrite || pr.user?.login === currentUser?.login}
            actions={
              <div className="flex items-center gap-2">
                {isOpen && (
                  <PRReviewForm
                    owner={owner}
                    repo={repo}
                    pullNumber={pr.number}
                    participants={participants}
                  />
                )}
                <PRMergePanel
                  owner={owner}
                  repo={repo}
                  pullNumber={pr.number}
                  prTitle={pr.title}
                  state={pr.state}
                  merged={!!pr.merged_at}
                  mergeable={pr.mergeable ?? null}
                  allowMergeCommit={
                    (repoData as any)?.allow_merge_commit ?? true
                  }
                  allowSquashMerge={
                    (repoData as any)?.allow_squash_merge ?? true
                  }
                  allowRebaseMerge={
                    (repoData as any)?.allow_rebase_merge ?? true
                  }
                  headBranch={pr.head.ref}
                  baseBranch={pr.base.ref}
                  canWrite={canWrite}
                  canTriage={canTriage}
                />
              </div>
            }
          />
        </>
      }
      diffPanel={
        <PRDiffViewer
          files={files as any}
          reviewComments={comments.reviewComments as any}
          reviewThreads={threads}
          reviewSummaries={reviewSummaries}
          commits={commits as any}
          owner={owner}
          repo={repo}
          pullNumber={pullNumber}
          headSha={headSha}
          headBranch={headBranch}
          canWrite={canWrite}
          highlightData={highlightData}
          participants={participants}
        />
      }
      conversationPanel={
        <PRConversation entries={timeline} owner={owner} repo={repo} pullNumber={pullNumber} />
      }
      commentForm={
        <PRCommentForm
          owner={owner}
          repo={repo}
          pullNumber={pullNumber}
          userAvatarUrl={currentUser?.avatar_url}
          userName={currentUser?.login}
          participants={participants}
        />
      }
    />
    <ChatPageActivator
      config={{
        chatType: "pr",
        contextKey: `${owner}/${repo}#${pullNumber}`,
        contextBody: {
          prContext: {
            owner,
            repo,
            pullNumber,
            prTitle: pr.title,
            prBody: pr.body || "",
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            files: (files || []).map((f: any) => ({
              filename: f.filename,
              patch: f.patch || "",
            })),
          },
        },
        suggestions: [
          "Summarize this PR",
          "Any potential bugs?",
          "Suggest improvements",
          "Explain the changes",
        ],
        placeholder: "Ask Ghost about this PR...",
        emptyTitle: "Ghost",
        emptyDescription:
          "Ask questions about changes, get explanations, or find potential issues",
        repoFileSearch: { owner, repo, ref: pr.head.ref },
      }}
    />
    </>
  );
}
