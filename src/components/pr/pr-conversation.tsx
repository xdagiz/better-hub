import Link from "next/link";
import Image from "next/image";
import { GitCommitHorizontal } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { cn } from "@/lib/utils";
import { CollapsibleReviewCard } from "./collapsible-review-card";
import { BotActivityGroup } from "./bot-activity-group";
import { CommitActivityGroup } from "./commit-activity-group";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";

interface BaseUser {
  login: string;
  avatar_url: string;
}

export interface DescriptionEntry {
  type: "description";
  id: string;
  user: BaseUser | null;
  body: string;
  created_at: string;
  reactions?: Reactions;
}

export interface CommentEntry {
  type: "comment";
  id: number;
  user: BaseUser | null;
  body: string;
  created_at: string;
  author_association?: string;
  reactions?: Reactions;
}

export interface ReviewEntry {
  type: "review";
  id: number;
  user: BaseUser | null;
  body: string | null;
  state: string;
  created_at: string;
  submitted_at: string | null;
  comments: ReviewCommentEntry[];
}

export interface ReviewCommentEntry {
  id: number;
  user: BaseUser | null;
  body: string;
  path: string;
  line: number | null;
  created_at: string;
}

export interface CommitEntry {
  type: "commit";
  id: string;
  sha: string;
  message: string;
  user: BaseUser | null;
  committer_name: string | null;
  created_at: string;
}

export type TimelineEntry = DescriptionEntry | CommentEntry | ReviewEntry | CommitEntry;

function isBot(entry: TimelineEntry): boolean {
  if (!entry.user) return false;
  if (entry.type === "description") return false;
  if (entry.type === "commit") return false;
  return entry.user.login.endsWith("[bot]") || entry.user.login.endsWith("-bot");
}

type GroupedItem =
  | { kind: "entry"; entry: TimelineEntry; index: number }
  | { kind: "bot-group"; entries: TimelineEntry[] }
  | { kind: "commit-group"; commits: CommitEntry[] };

function groupEntries(entries: TimelineEntry[]): GroupedItem[] {
  const groups: GroupedItem[] = [];
  let botBuffer: TimelineEntry[] = [];
  let commitBuffer: CommitEntry[] = [];

  const flushBots = () => {
    if (botBuffer.length === 0) return;
    if (botBuffer.length === 1) {
      groups.push({ kind: "entry", entry: botBuffer[0], index: -1 });
    } else {
      groups.push({ kind: "bot-group", entries: [...botBuffer] });
    }
    botBuffer = [];
  };

  const flushCommits = () => {
    if (commitBuffer.length === 0) return;
    groups.push({ kind: "commit-group", commits: [...commitBuffer] });
    commitBuffer = [];
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === "commit") {
      flushBots();
      commitBuffer.push(entry);
    } else if (isBot(entry)) {
      flushCommits();
      botBuffer.push(entry);
    } else {
      flushBots();
      flushCommits();
      groups.push({ kind: "entry", entry, index: i });
    }
  }
  flushBots();
  flushCommits();

  return groups;
}

export async function PRConversation({
  entries,
  owner,
  repo,
  pullNumber,
}: {
  entries: TimelineEntry[];
  owner: string;
  repo: string;
  pullNumber: number;
}) {
  const grouped = groupEntries(entries);

  return (
    <div className="space-y-3">
      {grouped.map((item, gi) => {
        if (item.kind === "bot-group") {
          const botNames = [...new Set(item.entries.map((e) => e.user!.login))];
          const avatars = [...new Set(item.entries.map((e) => e.user!.avatar_url))];
          return (
            <BotActivityGroup
              key={`bot-group-${gi}`}
              count={item.entries.length}
              botNames={botNames}
              avatars={avatars}
            >
              <div className="space-y-2">
                {item.entries.map((entry) => {
                  if (entry.type === "review") {
                    return <ReviewCardWrapper key={`review-${entry.id}`} entry={entry} />;
                  }
                  if (entry.type === "commit") {
                    return <CommitGroup key={`commit-${entry.sha}`} commits={[entry]} />;
                  }
                  return (
                    <ChatMessage
                      key={entry.type === "description" ? entry.id : `comment-${entry.id}`}
                      entry={entry}
                      isFirst={false}
                      owner={owner}
                      repo={repo}
                      pullNumber={pullNumber}
                    />
                  );
                })}
              </div>
            </BotActivityGroup>
          );
        }

        if (item.kind === "commit-group") {
          return <CommitGroup key={`commits-${gi}`} commits={item.commits} />;
        }

        const { entry, index } = item;
        if (entry.type === "review") {
          return <ReviewCardWrapper key={`review-${entry.id}`} entry={entry} />;
        }
        if (entry.type === "commit") {
          return <CommitGroup key={`commit-${entry.sha}`} commits={[entry]} />;
        }
        return (
          <ChatMessage
            key={entry.type === "description" ? entry.id : `comment-${entry.id}`}
            entry={entry}
            isFirst={index === 0}
            owner={owner}
            repo={repo}
            pullNumber={pullNumber}
          />
        );
      })}

      {entries.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground/40">
            No conversation yet
          </p>
        </div>
      )}
    </div>
  );
}

async function ChatMessage({
  entry,
  isFirst,
  owner,
  repo,
  pullNumber,
}: {
  entry: DescriptionEntry | CommentEntry;
  isFirst: boolean;
  owner: string;
  repo: string;
  pullNumber: number;
}) {
  const hasBody = entry.body && entry.body.trim().length > 0;

  return (
    <div className="group">
      <div
        className={cn(
          "border border-zinc-200/60 dark:border-zinc-800/50 rounded-lg overflow-hidden",
          isFirst && "border-zinc-200/80 dark:border-zinc-700/50"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/40",
            isFirst
              ? "bg-zinc-50/80 dark:bg-zinc-800/30"
              : "bg-zinc-50/50 dark:bg-zinc-800/20"
          )}
        >
          {entry.user ? (
            <Link href={`/users/${entry.user.login}`} className="flex items-center gap-2 hover:text-foreground transition-colors">
              <Image
                src={entry.user.avatar_url}
                alt={entry.user.login}
                width={16}
                height={16}
                className="rounded-full shrink-0"
              />
              <span className="text-xs font-medium text-foreground/80">
                {entry.user.login}
              </span>
            </Link>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
              <span className="text-xs font-medium text-foreground/80">ghost</span>
            </>
          )}
          {entry.type === "description" && (
            <span className="text-[10px] text-muted-foreground/50">
              opened
            </span>
          )}
          {entry.type === "comment" &&
            entry.author_association &&
            entry.author_association !== "NONE" && (
              <span className="text-[9px] px-1 py-px border border-zinc-200/80 dark:border-zinc-800/60 text-muted-foreground/50 rounded">
                {entry.author_association.toLowerCase()}
              </span>
            )}
          <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
            {timeAgo(entry.created_at)}
          </span>
        </div>

        {hasBody ? (
          <div className="px-3 py-2.5">
            <MarkdownRenderer content={entry.body} className="ghmd-sm" />
          </div>
        ) : (
          <div className="px-3 py-3">
            <p className="text-xs text-muted-foreground/30 italic">
              No description provided.
            </p>
          </div>
        )}

        {entry.reactions && (
          <div className="px-3 pb-2">
            <ReactionDisplay
              reactions={entry.reactions}
              owner={owner}
              repo={repo}
              contentType={entry.type === "description" ? "issue" : "issueComment"}
              contentId={entry.type === "description" ? pullNumber : entry.id as number}
            />
          </div>
        )}
      </div>
    </div>
  );
}

async function ReviewCardWrapper({ entry }: { entry: ReviewEntry }) {
  const hasBody = entry.body && entry.body.trim().length > 0;

  // Skip COMMENTED reviews with no body and no comments
  if (
    entry.state === "COMMENTED" &&
    !hasBody &&
    entry.comments.length === 0
  ) {
    return null;
  }

  // Pre-render the markdown body on the server
  const bodyContent = hasBody ? (
    <div className="px-3 py-2.5">
      <MarkdownRenderer content={entry.body!} className="ghmd-sm" />
    </div>
  ) : null;

  return (
    <CollapsibleReviewCard
      user={entry.user}
      state={entry.state}
      timestamp={entry.submitted_at || entry.created_at}
      comments={entry.comments}
      bodyContent={bodyContent}
    />
  );
}

function CommitGroup({ commits }: { commits: CommitEntry[] }) {
  const avatars = [...new Set(
    commits.filter((c) => c.user).map((c) => c.user!.avatar_url)
  )];

  const list = (
    <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800/50 overflow-hidden">
      {commits.map((commit, i) => {
        const firstLine = commit.message.split("\n")[0];
        return (
          <div
            key={commit.sha}
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5",
              i > 0 && "border-t border-zinc-200/40 dark:border-zinc-800/30"
            )}
          >
            <GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
            {commit.user ? (
              <Link href={`/users/${commit.user.login}`}>
                <Image
                  src={commit.user.avatar_url}
                  alt={commit.user.login}
                  width={16}
                  height={16}
                  className="rounded-full shrink-0"
                />
              </Link>
            ) : (
              <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
            )}
            <span className="text-xs text-foreground/80 truncate flex-1 min-w-0">
              {firstLine}
            </span>
            <code className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
              {commit.sha.slice(0, 7)}
            </code>
            <span className="text-[10px] text-muted-foreground/40 shrink-0">
              {timeAgo(commit.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (commits.length <= 1) return list;

  return (
    <CommitActivityGroup count={commits.length} avatars={avatars}>
      {list}
    </CommitActivityGroup>
  );
}
