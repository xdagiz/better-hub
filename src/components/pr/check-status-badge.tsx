"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ArrowRight,
  MinusCircle,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/use-click-outside";
import type { CheckStatus, CheckRun } from "@/lib/github";

function CheckIcon({ state, className }: { state: CheckRun["state"]; className?: string }) {
  switch (state) {
    case "success":
      return <CheckCircle2 className={cn("text-success", className)} />;
    case "failure":
    case "error":
      return <XCircle className={cn("text-destructive", className)} />;
    case "pending":
      return <Clock className={cn("text-warning", className)} />;
    case "neutral":
      return <MinusCircle className={cn("text-muted-foreground/60", className)} />;
    case "skipped":
      return <SkipForward className={cn("text-muted-foreground/40", className)} />;
  }
}

export function CheckStatusBadge({
  checkStatus,
  align = "left",
  owner,
  repo,
}: {
  checkStatus: CheckStatus;
  align?: "left" | "right";
  owner?: string;
  repo?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const colorClass =
    checkStatus.state === "success"
      ? "text-success"
      : checkStatus.state === "pending"
        ? "text-warning"
        : "text-destructive";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center gap-1 font-mono text-[10px] cursor-pointer hover:opacity-80 transition-opacity",
          colorClass
        )}
      >
        <CheckIcon state={checkStatus.state} className="w-3 h-3" />
        {checkStatus.success}/{checkStatus.total}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 top-full mt-1.5 w-72 border border-border bg-background shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <CheckIcon state={checkStatus.state} className="w-3.5 h-3.5" />
            <span className={cn("font-mono text-[11px] font-medium", colorClass)}>
              {checkStatus.state === "success"
                ? "All checks passed"
                : checkStatus.state === "pending"
                  ? "Checks in progress"
                  : `${checkStatus.failure} check${checkStatus.failure !== 1 ? "s" : ""} failed`}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">
              {checkStatus.success}/{checkStatus.total}
            </span>
          </div>

          {/* Check list */}
          <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
            {checkStatus.checks.map((check, i) => (
              <div
                key={`${check.name}-${i}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
              >
                <CheckIcon state={check.state} className="w-3 h-3 shrink-0" />
                <span className="font-mono text-[11px] truncate flex-1 text-foreground/80">
                  {check.name}
                </span>
                <span className={cn(
                  "font-mono text-[9px] uppercase tracking-wider shrink-0",
                  check.state === "success" ? "text-success/70" :
                  check.state === "pending" ? "text-warning/70" :
                  check.state === "failure" || check.state === "error" ? "text-destructive/70" :
                  "text-muted-foreground/40"
                )}>
                  {check.state}
                </span>
                {check.runId && owner && repo ? (
                  <Link
                    href={`/${owner}/${repo}/actions/${check.runId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : check.url ? (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
