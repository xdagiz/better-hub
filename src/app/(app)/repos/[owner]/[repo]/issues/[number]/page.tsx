import { getIssue, getIssueComments, getAuthenticatedUser } from "@/lib/github";
import { extractParticipants } from "@/lib/github-utils";
import { IssueHeader } from "@/components/issue/issue-header";
import { IssueDetailLayout } from "@/components/issue/issue-detail-layout";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { IssueConversation, type IssueTimelineEntry } from "@/components/issue/issue-conversation";
import { IssueCommentForm } from "@/components/issue/issue-comment-form";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { ReactionDisplay } from "@/components/shared/reaction-display";
import { TrackView } from "@/components/shared/track-view";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/lib/inngest";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);

  const [issue, comments, currentUser] = await Promise.all([
    getIssue(owner, repo, issueNumber),
    getIssueComments(owner, repo, issueNumber),
    getAuthenticatedUser(),
  ]);

  if (!issue) {
    return (
      <div className="py-16 text-center">
        <p className="text-xs text-muted-foreground font-mono">
          Issue not found
        </p>
      </div>
    );
  }

  // Fire-and-forget: embed issue content for semantic search
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user?.id) {
    void inngest.send({
      name: "app/content.viewed",
      data: {
        userId: session.user.id,
        contentType: "issue",
        owner,
        repo,
        number: issueNumber,
        title: issue.title,
        body: issue.body ?? "",
        comments: (comments || [])
          .filter((c: any) => c.body)
          .map((c: any) => ({
            id: c.id,
            body: c.body,
            author: c.user?.login ?? "unknown",
            createdAt: c.created_at,
          })),
      },
    });
  }

  const issueLabels = (issue.labels || []).map((l) =>
    typeof l === "string" ? l : l.name || ""
  ).filter(Boolean);

  const issueComments = (comments || []).map((c: any) => ({
    author: c.user?.login || "unknown",
    body: c.body || "",
    createdAt: c.created_at,
  }));

  // Build timeline for the conversation panel (comments only, issue body is on the left)
  const timeline: IssueTimelineEntry[] = (comments || []).map((c: any) => ({
    type: "comment" as const,
    id: c.id,
    user: c.user,
    body: c.body || "",
    created_at: c.created_at,
    author_association: c.author_association,
    reactions: c.reactions ?? undefined,
  }));

  // Extract participants for @mention autocomplete
  const participants = extractParticipants([
    issue.user ? { login: issue.user.login, avatar_url: issue.user.avatar_url } : null,
    ...(comments || []).map((c: any) =>
      c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null
    ),
  ]);

  return (
    <>
    <TrackView
      type="issue"
      url={`/repos/${owner}/${repo}/issues/${issueNumber}`}
      title={issue.title}
      subtitle={`${owner}/${repo}`}
      number={issueNumber}
      state={issue.state}
    />
    <IssueDetailLayout
      header={
        <IssueHeader
          title={issue.title}
          number={issue.number}
          state={issue.state}
          author={issue.user}
          createdAt={issue.created_at}
          commentsCount={issue.comments}
          labels={(issue.labels || []).map((l) =>
            typeof l === "string" ? { name: l } : { name: l.name, color: l.color ?? undefined }
          )}
          owner={owner}
          repo={repo}
        />
      }
      issueBody={
        <div className="px-1">
          {issue.body ? (
            <MarkdownRenderer content={issue.body} />
          ) : (
            <p className="text-xs text-muted-foreground/50 italic py-4">
              No description provided.
            </p>
          )}
          {(issue as any).reactions && (issue as any).reactions.total_count > 0 && (
            <div className="mt-3">
              <ReactionDisplay reactions={(issue as any).reactions} />
            </div>
          )}
        </div>
      }
      conversationPanel={
        <IssueConversation entries={timeline} owner={owner} repo={repo} issueNumber={issueNumber} />
      }
      commentForm={
        <IssueCommentForm
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
          userAvatarUrl={currentUser?.avatar_url}
          participants={participants}
        />
      }
      commentsCount={issue.comments}
    />
    <ChatPageActivator
      config={{
        chatType: "issue",
        contextKey: `${owner}/${repo}#i${issueNumber}`,
        contextBody: {
          issueContext: {
            owner,
            repo,
            issueNumber,
            title: issue.title,
            body: issue.body ?? null,
            labels: issueLabels,
            state: issue.state,
            comments: issueComments,
          },
        },
        suggestions: [
          "Summarize this issue",
          "Suggest a fix",
          "Draft a response",
          "Create a PR to fix this",
        ],
        placeholder: "Ask Ghost about this issue...",
        emptyTitle: "Ghost",
        emptyDescription:
          "Ask questions, get help drafting responses, or create a PR to fix this issue",
      }}
    />
    </>
  );
}
