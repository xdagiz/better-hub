"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  GitPullRequest,
  GitMerge,
  MessageSquare,
  Clock,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toInternalUrl } from "@/lib/github-utils";
import { CopyLinkButton } from "@/components/shared/copy-link-button";
import { CollectionsContent } from "@/components/collections/collections-content";

interface IssueItem {
  id: number;
  title: string;
  html_url: string;
  number: number;
  state: string;
  created_at: string;
  updated_at: string;
  repository_url: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<{ name?: string; color?: string }>;
  draft?: boolean;
  pull_request?: { merged_at: string | null };
  comments: number;
}

interface CollectionSummary {
  id: string;
  name: string;
  totalItems: number;
  reviewedItems: number;
  updatedAt: string;
}

type TabType = "review" | "created" | "assigned" | "mentioned" | "collections";

function extractRepoName(url: string) {
  const parts = url.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function PRsContent({
  created,
  reviewRequested,
  assigned,
  mentioned,
  username,
  collections = [],
}: {
  created: { items: IssueItem[]; total_count: number };
  reviewRequested: { items: IssueItem[]; total_count: number };
  assigned: { items: IssueItem[]; total_count: number };
  mentioned: { items: IssueItem[]; total_count: number };
  username: string;
  collections?: CollectionSummary[];
}) {
  const [tab, setTab] = useState<TabType>("review");

  const tabs: { key: TabType; label: string; count: number; num: string }[] = [
    { key: "review", label: "Review requested", count: reviewRequested.total_count, num: "01" },
    { key: "created", label: "Created", count: created.total_count, num: "02" },
    { key: "assigned", label: "Assigned", count: assigned.total_count, num: "03" },
    { key: "mentioned", label: "Mentioned", count: mentioned.total_count, num: "04" },
    { key: "collections", label: "Collections", count: collections.length, num: "05" },
  ];

  const items = tab !== "collections" ? {
    review: reviewRequested.items,
    created: created.items,
    assigned: assigned.items,
    mentioned: mentioned.items,
  }[tab] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h1 className="text-xl font-medium tracking-tight">Pull Requests</h1>
        <p className="text-sm text-muted-foreground/70 mt-0.5">
          All pull requests relevant to you across GitHub
        </p>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex items-center gap-0 border-b border-border mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer",
              tab === t.key
                ? "border-foreground/60 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/60"
            )}
          >
            <span className="text-[9px] text-zinc-300 dark:text-zinc-700">{t.num}</span>
            {t.label}
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 border rounded-sm",
                tab === t.key
                  ? "border-zinc-300 dark:border-zinc-700 text-foreground"
                  : "border-zinc-200 dark:border-zinc-800 text-muted-foreground/60"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}

        {tab !== "collections" && (
          <span className="text-[11px] text-muted-foreground/40 font-mono ml-auto pr-1">
            {items.length} shown
          </span>
        )}
      </div>

      {/* Collections tab */}
      {tab === "collections" ? (
        <CollectionsContent collections={collections} />
      ) : (
      /* PR List */
      <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {items.map((pr) => {
          const repo = extractRepoName(pr.repository_url);
          const isMerged = pr.pull_request?.merged_at;
          const isDraft = pr.draft;

          return (
            <Link
              key={pr.id}
              href={toInternalUrl(pr.html_url)}
              className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
            >
              {isMerged ? (
                <GitMerge className="w-3.5 h-3.5 shrink-0 text-purple-400" />
              ) : (
                <GitPullRequest
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    isDraft ? "text-muted-foreground/50" : "text-success"
                  )}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground truncate group-hover:text-foreground transition-colors font-mono">
                    {pr.title}
                  </span>
                  {isDraft && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 shrink-0 rounded-sm">
                      Draft
                    </span>
                  )}
                  {pr.labels
                    .filter((l) => l.name)
                    .slice(0, 3)
                    .map((label) => (
                      <span
                        key={label.name}
                        className="text-[9px] font-mono px-1.5 py-0.5 border shrink-0 rounded-sm"
                        style={{
                          borderColor: `#${label.color || "888"}30`,
                          color: `#${label.color || "888"}`,
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    {repo}#{pr.number}
                  </span>
                  {pr.user && pr.user.login !== username && (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                      <Image
                        src={pr.user.avatar_url}
                        alt={pr.user.login}
                        width={14}
                        height={14}
                        className="rounded-full"
                      />
                      <span className="font-mono">{pr.user.login}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50 font-mono">
                    <Clock className="w-3 h-3" />
                    {timeAgo(pr.updated_at)}
                  </span>
                  {pr.comments > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                      <MessageSquare className="w-3 h-3" />
                      {pr.comments}
                    </span>
                  )}
                </div>
              </div>
              <CopyLinkButton
                owner={repo.split("/")[0]}
                repo={repo.split("/")[1]}
                number={pr.number}
                type="pulls"
                iconOnly
              />
            </Link>
          );
        })}

        {items.length === 0 && (
          <div className="py-16 text-center">
            <GitPullRequest className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              No pull requests in this category
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
