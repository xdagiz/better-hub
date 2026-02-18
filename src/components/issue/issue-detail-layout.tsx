"use client";

import { useState, useRef, useCallback } from "react";
import { MessageCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResizeHandle } from "@/components/ui/resize-handle";

type MobileTab = "issue" | "chat";

interface IssueDetailLayoutProps {
  header: React.ReactNode;
  /** Issue body (the original post) */
  issueBody: React.ReactNode;
  /** Comments / conversation thread */
  conversationPanel: React.ReactNode;
  /** Sticky comment form pinned to the bottom of the conversation panel */
  commentForm?: React.ReactNode;
  commentsCount: number;
}

export function IssueDetailLayout({
  header,
  issueBody,
  conversationPanel,
  commentForm,
  commentsCount,
}: IssueDetailLayoutProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("issue");
  const [splitRatio, setSplitRatio] = useState(60);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const leftCollapsed = splitRatio <= 3;
  const rightCollapsed = splitRatio >= 97;

  const handleResize = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.round((x / rect.width) * 100);
      if (pct > 95) setSplitRatio(100);
      else if (pct < 5) setSplitRatio(0);
      else setSplitRatio(Math.max(25, Math.min(75, pct)));
    },
    []
  );

  const handleDoubleClick = useCallback(() => {
    setSplitRatio(60);
  }, []);

  const handleRestore = () => setSplitRatio(60);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="shrink-0 pt-3">{header}</div>

      {/* Mobile tabs */}
      <div className="lg:hidden shrink-0 flex">
        {(
          [
            { key: "issue", icon: FileText, label: "Issue", count: 0 },
            { key: "chat", icon: MessageCircle, label: "Chat", count: commentsCount },
          ] as const
        ).map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border-b-2 -mb-px transition-colors cursor-pointer",
              mobileTab === key
                ? "border-foreground/50 text-foreground font-medium"
                : "border-transparent text-muted-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && (
              <span className="text-[10px] text-muted-foreground/60">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop split panels */}
      <div ref={containerRef} className="flex-1 min-h-0 hidden lg:flex">
        {/* Left panel (issue body) */}
        <div
          className="min-h-0 flex flex-col overflow-hidden"
          style={{
            width: `${splitRatio}%`,
            transition: isDragging ? "none" : "width 0.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {!leftCollapsed && (
            <div className="flex-1 overflow-y-auto min-h-0 pb-4 space-y-4">
              {issueBody}
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div className="relative shrink-0 flex items-stretch">
          <ResizeHandle
            onResize={handleResize}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            onDoubleClick={handleDoubleClick}
          />

          {rightCollapsed && (
            <button
              onClick={handleRestore}
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full",
                "border border-zinc-200/80 dark:border-zinc-700/80",
                "bg-white dark:bg-zinc-900 shadow-sm",
                "text-muted-foreground/60 hover:text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-600",
                "cursor-pointer transition-all duration-150"
              )}
              title="Show sidebar"
            >
              <MessageCircle className="w-3 h-3" />
            </button>
          )}
          {leftCollapsed && (
            <button
              onClick={handleRestore}
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full",
                "border border-zinc-200/80 dark:border-zinc-700/80",
                "bg-white dark:bg-zinc-900 shadow-sm",
                "text-muted-foreground/60 hover:text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-600",
                "cursor-pointer transition-all duration-150"
              )}
              title="Show issue"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Right panel (conversation) */}
        <div
          className="min-h-0 flex flex-col overflow-hidden"
          style={{
            width: `${100 - splitRatio}%`,
            transition: isDragging ? "none" : "width 0.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {!rightCollapsed && (
            <>
              <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
                {conversationPanel}
              </div>
              {commentForm && (
                <div className="shrink-0 px-3 pb-3 pt-3">
                  {commentForm}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile panels */}
      <div className="flex-1 min-h-0 lg:hidden flex flex-col">
        <div className={cn("flex-1 min-h-0 overflow-y-auto pb-4 space-y-4", mobileTab === "issue" ? "block" : "hidden")}>
          {issueBody}
        </div>
        <div className={cn("flex-1 min-h-0 flex flex-col", mobileTab === "chat" ? "flex" : "hidden")}>
          <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
            {conversationPanel}
          </div>
          {commentForm && (
            <div className="shrink-0 px-3 pb-3 pt-3">
              {commentForm}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
