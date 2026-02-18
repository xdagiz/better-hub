"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";

const reviewStateBadge: Record<
  string,
  { label: string; className: string }
> = {
  APPROVED: {
    label: "approved",
    className:
      "text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
  },
  CHANGES_REQUESTED: {
    label: "changes requested",
    className:
      "text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/5",
  },
  COMMENTED: {
    label: "reviewed",
    className:
      "text-blue-600 dark:text-blue-400 border-blue-500/20 bg-blue-500/5",
  },
  DISMISSED: {
    label: "dismissed",
    className:
      "text-zinc-500 dark:text-zinc-400 border-zinc-500/20 bg-zinc-500/5",
  },
};

interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
}

interface CollapsibleReviewCardProps {
  user: { login: string; avatar_url: string } | null;
  state: string;
  timestamp: string;
  comments: ReviewComment[];
  bodyContent: React.ReactNode;
}

export function CollapsibleReviewCard({
  user,
  state,
  timestamp,
  comments,
  bodyContent,
}: CollapsibleReviewCardProps) {
  const [expanded, setExpanded] = useState(true);
  const badge = reviewStateBadge[state] || reviewStateBadge.COMMENTED;
  const hasContent = bodyContent || comments.length > 0;

  return (
    <div className="group">
      <div className="border border-zinc-200/60 dark:border-zinc-800/50 rounded-lg overflow-hidden">
        {/* Review header — clickable to collapse */}
        <button
          onClick={() => hasContent && setExpanded((e) => !e)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/40 bg-zinc-50/50 dark:bg-zinc-800/20 text-left",
            hasContent && "cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
          )}
        >
          {hasContent && (
            <ChevronDown
              className={cn(
                "w-3 h-3 text-muted-foreground/40 transition-transform duration-200 shrink-0",
                !expanded && "-rotate-90"
              )}
            />
          )}
          {user ? (
            <Link
              href={`/users/${user.login}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-xs font-medium text-foreground/80 hover:text-foreground hover:underline transition-colors"
            >
              <Image
                src={user.avatar_url}
                alt={user.login}
                width={16}
                height={16}
                className="rounded-full shrink-0"
              />
              {user.login}
            </Link>
          ) : (
            <>
              <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
              <span className="text-xs font-medium text-foreground/80">ghost</span>
            </>
          )}
          <span
            className={cn(
              "text-[9px] px-1.5 py-px border rounded",
              badge.className
            )}
          >
            {badge.label}
          </span>
          {!expanded && comments.length > 0 && (
            <span className="text-[10px] text-muted-foreground/40">
              {comments.length} comment{comments.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
            {timeAgo(timestamp)}
          </span>
        </button>

        {/* Collapsible body */}
        <div
          className={cn(
            "transition-all duration-200 ease-out overflow-hidden",
            expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          {/* Server-rendered markdown body */}
          {bodyContent}

          {/* Nested review comments */}
          {comments.length > 0 && (
            <div
              className={cn(
                bodyContent &&
                  "border-t border-zinc-200/40 dark:border-zinc-800/30"
              )}
            >
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="px-3 py-2 border-b border-zinc-200/30 dark:border-zinc-800/20 last:border-b-0"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-muted-foreground/50 truncate font-mono">
                      {comment.path}
                      {comment.line !== null && `:${comment.line}`}
                    </span>
                  </div>
                  <div className="text-xs text-foreground/70">
                    <ClientMarkdown content={comment.body} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
