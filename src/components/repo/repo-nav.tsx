"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface RepoNavProps {
  owner: string;
  repo: string;
  openIssuesCount?: number;
  openPrsCount?: number;
  activeRunsCount?: number;
  showPeopleTab?: boolean;
}

export function RepoNav({ owner, repo, openIssuesCount, openPrsCount, activeRunsCount, showPeopleTab }: RepoNavProps) {
  const pathname = usePathname();
  const base = `/repos/${owner}/${repo}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [hasAnimated, setHasAnimated] = useState(false);

  const tabs = [
    {
      label: "Code",
      href: base,
      active:
        pathname === base ||
        pathname.startsWith(`${base}/tree`) ||
        pathname.startsWith(`${base}/blob`),
    },
    {
      label: "Commits",
      href: `${base}/commits`,
      active: pathname.startsWith(`${base}/commits`),
    },
    {
      label: "PRs",
      href: `${base}/pulls`,
      active: pathname.startsWith(`${base}/pulls`),
      count: openPrsCount,
    },
    {
      label: "Issues",
      href: `${base}/issues`,
      active: pathname.startsWith(`${base}/issues`),
      count: openIssuesCount,
    },
    ...(showPeopleTab
      ? [
          {
            label: "People",
            href: `${base}/people`,
            active: pathname.startsWith(`${base}/people`),
          },
        ]
      : []),
    {
      label: "Actions",
      href: `${base}/actions`,
      active: pathname.startsWith(`${base}/actions`),
      count: activeRunsCount,
    },
    {
      label: "Security",
      href: `${base}/security`,
      active: pathname.startsWith(`${base}/security`),
    },
    {
      label: "Settings",
      href: `${base}/settings`,
      active: pathname.startsWith(`${base}/settings`),
    },
  ];

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector<HTMLElement>("[data-active='true']");
    if (activeEl) {
      setIndicator({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
      if (!hasAnimated) setHasAnimated(true);
    }
  }, [hasAnimated]);

  useEffect(() => {
    updateIndicator();
  }, [pathname, updateIndicator]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 pt-2 pb-0">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          data-active={tab.active}
          className={cn(
            "relative flex items-center gap-2 px-3 py-2 text-sm transition-colors",
            tab.active
              ? "text-foreground font-medium"
              : "text-muted-foreground/70 hover:text-muted-foreground"
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                tab.active
                  ? "bg-zinc-200 dark:bg-zinc-800 text-foreground/70"
                  : "bg-zinc-100 dark:bg-zinc-800/50 text-muted-foreground/60"
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
      <div
        className={cn(
          "absolute bottom-0 h-0.5 bg-foreground",
          hasAnimated ? "transition-all duration-200 ease-out" : ""
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}
