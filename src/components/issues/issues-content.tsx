"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CircleDot,
  MessageSquare,
  Clock,
  User,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toInternalUrl } from "@/lib/github-utils";
import { CopyLinkButton } from "@/components/shared/copy-link-button";

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
  comments: number;
}

type TabType = "assigned" | "created" | "mentioned";

function extractRepoName(url: string) {
  const parts = url.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function IssuesContent({
  assigned,
  created,
  mentioned,
  username,
}: {
  assigned: { items: IssueItem[]; total_count: number };
  created: { items: IssueItem[]; total_count: number };
  mentioned: { items: IssueItem[]; total_count: number };
  username: string;
}) {
  const [tab, setTab] = useState<TabType>("assigned");

  const tabs: { key: TabType; label: string; count: number; num: string }[] = [
    { key: "assigned", label: "Assigned", count: assigned.total_count, num: "01" },
    { key: "created", label: "Created", count: created.total_count, num: "02" },
    { key: "mentioned", label: "Mentioned", count: mentioned.total_count, num: "03" },
  ];

  const items = {
    assigned: assigned.items,
    created: created.items,
    mentioned: mentioned.items,
  }[tab];

  return (
    <div className="py-4 md:py-6 max-w-[1100px] mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-medium tracking-tight">Issues</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          All issues relevant to you across GitHub.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border mb-6">
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
                "text-[9px] px-1.5 py-0.5 border",
                tab === t.key
                  ? "border-zinc-300 dark:border-zinc-700 text-foreground"
                  : "border-zinc-200 dark:border-zinc-800 text-muted-foreground/60"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Issue List */}
      <div className="border border-border divide-y divide-border">
        {items.map((issue) => {
          const repo = extractRepoName(issue.repository_url);

          return (
            <Link
              key={issue.id}
              href={toInternalUrl(issue.html_url)}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
            >
              <CircleDot className="w-3.5 h-3.5 text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground truncate group-hover:text-foreground transition-colors">
                    {issue.title}
                  </span>
                  {issue.labels
                    .filter((l) => l.name)
                    .slice(0, 3)
                    .map((label) => (
                      <span
                        key={label.name}
                        className="text-[9px] font-mono px-1.5 py-0.5 border shrink-0"
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
                    {repo}#{issue.number}
                  </span>
                  {issue.user && issue.user.login !== username && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                      <User className="w-3 h-3" />
                      {issue.user.login}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                    <Clock className="w-3 h-3" />
                    {timeAgo(issue.updated_at)}
                  </span>
                  {issue.comments > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                      <MessageSquare className="w-3 h-3" />
                      {issue.comments}
                    </span>
                  )}
                </div>
              </div>
              <CopyLinkButton
                owner={repo.split("/")[0]}
                repo={repo.split("/")[1]}
                number={issue.number}
                type="issues"
                iconOnly
              />
            </Link>
          );
        })}

        {items.length === 0 && (
          <div className="py-16 text-center">
            <CircleDot className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              No issues in this category
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
