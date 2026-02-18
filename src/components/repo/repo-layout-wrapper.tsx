"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepoLayoutWrapperProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  owner: string;
  repo: string;
  avatarUrl?: string;
}

function NavBreadcrumb({ owner, repo, avatarUrl }: { owner: string; repo: string; avatarUrl?: string }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("navbar-breadcrumb"));
  }, []);

  if (!container) return null;

  return createPortal(
    <>
      <span className="text-muted-foreground/30 mx-1.5">/</span>
      <Link
        href={`/orgs/${owner}`}
        className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
      >
        {owner}
      </Link>
      <span className="text-muted-foreground/25 mx-1">/</span>
      <Link
        href={`/repos/${owner}/${repo}`}
        className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {repo}
      </Link>
    </>,
    container
  );
}

export function RepoLayoutWrapper({ sidebar, children, owner, repo, avatarUrl }: RepoLayoutWrapperProps) {
  const [sidebarVisible, setSidebarVisible] = useState(true);

  return (
    <>
    <NavBreadcrumb owner={owner} repo={repo} avatarUrl={avatarUrl} />
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Sidebar */}
      <div
        className={cn(
          "hidden lg:flex shrink-0 transition-[width,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden relative",
          sidebarVisible ? "w-[260px] opacity-100" : "w-0 opacity-0"
        )}
      >
        <div className="w-[260px] min-w-[260px]">
          {sidebar}
        </div>
      </div>

      {/* Sidebar toggle */}
      <div
        className={cn(
          "hidden lg:flex items-center shrink-0 z-10",
          "group/toggle",
          sidebarVisible ? "relative" : "absolute left-0 top-0 h-full"
        )}
      >
        <button
          onClick={() => setSidebarVisible((v) => !v)}
          className={cn(
            "flex items-center justify-center w-5 h-10 rounded-md",
            "text-muted-foreground/0 group-hover/toggle:text-muted-foreground/60 hover:!text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/40",
            "cursor-pointer transition-all duration-150"
          )}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarVisible ? (
            <ChevronsLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronsRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {children}
      </div>
    </div>
    </>
  );
}
