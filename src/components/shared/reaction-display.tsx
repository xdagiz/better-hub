"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  getReactionUsers,
  type ReactionUser,
} from "@/app/(app)/repos/[owner]/[repo]/reaction-actions";

export interface Reactions {
  "+1"?: number;
  "-1"?: number;
  laugh?: number;
  hooray?: number;
  confused?: number;
  heart?: number;
  rocket?: number;
  eyes?: number;
  total_count?: number;
  [key: string]: unknown;
}

const REACTION_EMOJI: [string, string][] = [
  ["+1", "\uD83D\uDC4D"],
  ["-1", "\uD83D\uDC4E"],
  ["laugh", "\uD83D\uDE04"],
  ["hooray", "\uD83C\uDF89"],
  ["confused", "\uD83D\uDE15"],
  ["heart", "\u2764\uFE0F"],
  ["rocket", "\uD83D\uDE80"],
  ["eyes", "\uD83D\uDC40"],
];

interface ReactionDisplayProps {
  reactions: Reactions;
  /** owner/repo/contentType/contentId for fetching who reacted */
  owner?: string;
  repo?: string;
  contentType?: "issue" | "issueComment";
  contentId?: number;
  className?: string;
}

export function ReactionDisplay({
  reactions,
  owner,
  repo,
  contentType,
  contentId,
  className,
}: ReactionDisplayProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [reactionUsers, setReactionUsers] = useState<ReactionUser[] | null>(
    null
  );
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const canFetch = !!(owner && repo && contentType && contentId);

  // Pre-fetch reaction users on mount
  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    getReactionUsers(owner!, repo!, contentType!, contentId!).then((res) => {
      if (!cancelled) setReactionUsers(res.users);
    });
    return () => {
      cancelled = true;
    };
  }, [canFetch, owner, repo, contentType, contentId]);

  const handleMouseEnter = (key: string) => {
    hoverTimeout.current = setTimeout(() => {
      setHoveredKey(key);
    }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHoveredKey(null);
  };

  const entries = REACTION_EMOJI.map(([key, emoji]) => ({
    key,
    emoji,
    count: (typeof reactions[key] === "number" ? reactions[key] : 0) as number,
  })).filter((r) => r.count > 0);

  if (entries.length === 0) return null;

  const getUsersForReaction = (key: string): string[] => {
    if (!reactionUsers) return [];
    return reactionUsers
      .filter((u) => u.content === key)
      .map((u) => u.login);
  };

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {entries.map((r) => {
        const isHovered = hoveredKey === r.key;
        const users = isHovered ? getUsersForReaction(r.key) : [];

        return (
          <span
            key={r.key}
            className="relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border bg-muted/40 dark:bg-white/[0.03] text-[11px] cursor-default"
            onMouseEnter={() => handleMouseEnter(r.key)}
            onMouseLeave={handleMouseLeave}
          >
            <span>{r.emoji}</span>
            <span className="font-mono text-muted-foreground/70 text-[10px]">
              {r.count}
            </span>

            {/* Tooltip */}
            {isHovered && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
                <div className="bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-200 text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap max-w-[200px]">
                  {users.length > 0 ? (
                    <span className="truncate block">
                      {users.slice(0, 10).join(", ")}
                      {users.length > 10 && ` +${users.length - 10}`}
                    </span>
                  ) : (
                    <span>
                      {r.count} reaction{r.count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}
