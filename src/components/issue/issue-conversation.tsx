import Link from "next/link";
import Image from "next/image";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { BotActivityGroup } from "@/components/pr/bot-activity-group";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";

interface BaseUser {
  login: string;
  avatar_url: string;
}

export interface IssueDescriptionEntry {
  type: "description";
  id: string;
  user: BaseUser | null;
  body: string;
  created_at: string;
  reactions?: Reactions;
}

export interface IssueCommentEntry {
  type: "comment";
  id: number;
  user: BaseUser | null;
  body: string;
  created_at: string;
  author_association?: string;
  reactions?: Reactions;
}

export type IssueTimelineEntry = IssueDescriptionEntry | IssueCommentEntry;

function isBot(entry: IssueTimelineEntry): boolean {
  if (!entry.user) return false;
  if (entry.type === "description") return false;
  return entry.user.login.endsWith("[bot]") || entry.user.login.endsWith("-bot");
}

type GroupedItem =
  | { kind: "entry"; entry: IssueTimelineEntry; index: number }
  | { kind: "bot-group"; entries: IssueTimelineEntry[] };

function groupEntries(entries: IssueTimelineEntry[]): GroupedItem[] {
  const groups: GroupedItem[] = [];
  let botBuffer: IssueTimelineEntry[] = [];

  const flushBots = () => {
    if (botBuffer.length === 0) return;
    if (botBuffer.length === 1) {
      groups.push({ kind: "entry", entry: botBuffer[0], index: -1 });
    } else {
      groups.push({ kind: "bot-group", entries: [...botBuffer] });
    }
    botBuffer = [];
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (isBot(entry)) {
      botBuffer.push(entry);
    } else {
      flushBots();
      groups.push({ kind: "entry", entry, index: i });
    }
  }
  flushBots();

  return groups;
}

export async function IssueConversation({
  entries,
  owner,
  repo,
  issueNumber,
}: {
  entries: IssueTimelineEntry[];
  owner: string;
  repo: string;
  issueNumber: number;
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
                {item.entries.map((entry) => (
                  <ChatMessage
                    key={entry.type === "description" ? entry.id : `comment-${entry.id}`}
                    entry={entry}
                    isFirst={false}
                    owner={owner}
                    repo={repo}
                    issueNumber={issueNumber}
                  />
                ))}
              </div>
            </BotActivityGroup>
          );
        }

        const { entry, index } = item;
        return (
          <ChatMessage
            key={entry.type === "description" ? entry.id : `comment-${entry.id}`}
            entry={entry}
            isFirst={index === 0}
            owner={owner}
            repo={repo}
            issueNumber={issueNumber}
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
  issueNumber,
}: {
  entry: IssueTimelineEntry;
  isFirst: boolean;
  owner: string;
  repo: string;
  issueNumber: number;
}) {
  const hasBody = entry.body && entry.body.trim().length > 0;

  return (
    <div className="group">
      <div
        className={cn(
          "border border-border/60 rounded-lg overflow-hidden",
          isFirst && "border-border/80"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 border-b border-border/60",
            isFirst
              ? "bg-card/80"
              : "bg-card/50"
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
              <div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
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
              <span className="text-[9px] px-1 py-px border border-border/60 text-muted-foreground/50 rounded">
                {entry.author_association.toLowerCase()}
              </span>
            )}
          <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
            <TimeAgo date={entry.created_at} />
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
              contentId={entry.type === "description" ? issueNumber : entry.id as number}
            />
          </div>
        )}
      </div>
    </div>
  );
}
