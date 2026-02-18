"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  History,
  GitPullRequest,
  CircleDot,
  ChevronRight,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { getRecentViews, type RecentViewItem } from "@/lib/recent-views";

export function RecentlyViewed() {
  const [views, setViews] = useState<RecentViewItem[]>([]);

  useEffect(() => {
    setViews(getRecentViews());
  }, []);

  if (views.length === 0) return null;

  return (
    <section className="shrink border border-border bg-card flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
        <History className="w-3 h-3 text-muted-foreground/50" />
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Recently viewed
        </h2>
      </div>
      <div className="overflow-y-auto">
        {views.slice(0, 8).map((item) => (
          <RecentViewRow key={item.url} item={item} />
        ))}
      </div>
    </section>
  );
}

function RecentViewRow({ item }: { item: RecentViewItem }) {
  const icon =
    item.type === "pr" ? (
      <GitPullRequest
        className={cn(
          "w-3.5 h-3.5 shrink-0",
          item.state === "merged"
            ? "text-purple-500"
            : item.state === "open"
            ? "text-emerald-500"
            : "text-muted-foreground/60"
        )}
      />
    ) : item.type === "issue" ? (
      <CircleDot
        className={cn(
          "w-3.5 h-3.5 shrink-0",
          item.state === "open"
            ? "text-emerald-500"
            : "text-muted-foreground/60"
        )}
      />
    ) : item.image ? (
      <Image
        src={item.image}
        alt=""
        width={16}
        height={16}
        className="w-4 h-4 rounded-sm shrink-0"
      />
    ) : (
      <div className="w-4 h-4 rounded-sm shrink-0 bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
        {item.title.charAt(0).toUpperCase()}
      </div>
    );

  return (
    <Link
      href={item.url}
      className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border last:border-b-0"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate block group-hover:text-foreground transition-colors">
          {item.title}
          {item.number && (
            <span className="text-muted-foreground/50 ml-1">
              #{item.number}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 mt-px">
          <span className="text-[11px] font-mono text-muted-foreground/70 truncate">
            {item.subtitle}
          </span>
          <span className="text-[11px] text-muted-foreground/50 shrink-0">
            {timeAgo(new Date(item.viewedAt).toISOString())}
          </span>
        </div>
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}
