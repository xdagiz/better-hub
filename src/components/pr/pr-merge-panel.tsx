"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
  GitMerge,
  ChevronDown,
  XCircle,
  RotateCcw,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  mergePullRequest,
  closePullRequest,
  reopenPullRequest,
  type MergeMethod,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";

interface PRMergePanelProps {
  owner: string;
  repo: string;
  pullNumber: number;
  prTitle: string;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  allowMergeCommit: boolean;
  allowSquashMerge: boolean;
  allowRebaseMerge: boolean;
  headBranch: string;
  baseBranch: string;
  canWrite?: boolean;
  canTriage?: boolean;
}

const mergeMethodLabels: Record<MergeMethod, { short: string; description: string }> = {
  squash: {
    short: "Squash",
    description: "Squash and merge",
  },
  merge: {
    short: "Merge",
    description: "Merge commit",
  },
  rebase: {
    short: "Rebase",
    description: "Rebase and merge",
  },
};

export function PRMergePanel({
  owner,
  repo,
  pullNumber,
  prTitle,
  state,
  merged,
  mergeable,
  allowMergeCommit,
  allowSquashMerge,
  allowRebaseMerge,
  canWrite = true,
  canTriage = true,
}: PRMergePanelProps) {
  const availableMethods: MergeMethod[] = [
    ...(allowSquashMerge ? ["squash" as const] : []),
    ...(allowMergeCommit ? ["merge" as const] : []),
    ...(allowRebaseMerge ? ["rebase" as const] : []),
  ];

  const router = useRouter();
  const [method, setMethod] = useState<MergeMethod>(
    availableMethods[0] ?? "merge"
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [squashDialogOpen, setSquashDialogOpen] = useState(false);
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, useCallback(() => setDropdownOpen(false), []));

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => setResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const doMerge = (mergeMethod: MergeMethod, title?: string, message?: string) => {
    setResult(null);
    startTransition(async () => {
      const res = await mergePullRequest(owner, repo, pullNumber, mergeMethod, title, message);
      if (res.error) {
        setResult({ type: "error", message: res.error });
      } else {
        setResult({ type: "success", message: "Merged" });
        setSquashDialogOpen(false);
        router.refresh();
      }
    });
  };

  const handleMergeClick = () => {
    if (method === "squash") {
      setCommitTitle(`${prTitle} (#${pullNumber})`);
      setCommitMessage("");
      setSquashDialogOpen(true);
    } else {
      doMerge(method);
    }
  };

  const handleSquashConfirm = () => {
    doMerge("squash", commitTitle || undefined, commitMessage || undefined);
  };

  const handleClose = () => {
    setResult(null);
    startTransition(async () => {
      const res = await closePullRequest(owner, repo, pullNumber);
      if (res.error) {
        setResult({ type: "error", message: res.error });
      } else {
        setResult({ type: "success", message: "Closed" });
        router.refresh();
      }
    });
  };

  const handleReopen = () => {
    setResult(null);
    startTransition(async () => {
      const res = await reopenPullRequest(owner, repo, pullNumber);
      if (res.error) {
        setResult({ type: "error", message: res.error });
      } else {
        setResult({ type: "success", message: "Reopened" });
        router.refresh();
      }
    });
  };

  if (merged) return null;

  if (state === "closed") {
    if (!canTriage) return null;
    return (
      <div className="flex items-center gap-2">
        {result && (
          <span className={cn(
            "text-[10px] font-mono",
            result.type === "error" ? "text-red-500" : "text-emerald-500"
          )}>
            {result.message}
          </span>
        )}
        <button
          onClick={handleReopen}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
          Reopen
        </button>
      </div>
    );
  }

  if (!canWrite && !canTriage) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {result && (
          <span className={cn(
            "text-[10px] font-mono",
            result.type === "error" ? "text-red-500" : "text-emerald-500"
          )}>
            {result.message}
          </span>
        )}

        {/* Merge button with dropdown */}
        {canWrite && (
          <div ref={dropdownRef} className="relative">
            <div className="flex items-center border border-foreground/80 divide-x divide-foreground/20">
              <button
                onClick={handleMergeClick}
                disabled={isPending}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                  mergeable === false
                    ? "bg-foreground/70 text-background hover:bg-foreground/60"
                    : "bg-foreground text-background hover:bg-foreground/90"
                )}
                title={mergeable === false ? "There may be conflicts — merge might fail" : undefined}
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <GitMerge className="w-3 h-3" />
                )}
                {mergeMethodLabels[method].short}
              </button>

              {availableMethods.length > 1 && (
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  disabled={isPending}
                  className={cn(
                    "flex items-center self-stretch px-1.5 text-background transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                    mergeable === false
                      ? "bg-foreground/70 hover:bg-foreground/60"
                      : "bg-foreground hover:bg-foreground/90"
                  )}
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </div>

            {dropdownOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-background border border-border shadow-lg dark:shadow-2xl z-50 py-1">
                {availableMethods.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMethod(m);
                      setDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
                      method === m
                        ? "bg-muted/50 dark:bg-white/[0.04] text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.03] hover:text-foreground"
                    )}
                  >
                    {method === m ? (
                      <Check className="w-3 h-3 shrink-0" />
                    ) : (
                      <div className="w-3 h-3 shrink-0" />
                    )}
                    <span className="text-xs">{mergeMethodLabels[m].description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        {canTriage && (
          <button
            onClick={handleClose}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XCircle className="w-3 h-3" />
            Close
          </button>
        )}
      </div>

      {/* Squash merge dialog */}
      <Dialog open={squashDialogOpen} onOpenChange={setSquashDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Squash and merge</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              All commits will be squashed into a single commit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1.5">
                Commit message
              </label>
              <input
                type="text"
                value={commitTitle}
                onChange={(e) => setCommitTitle(e.target.value)}
                className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
                placeholder="Commit title"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1.5">
                Description
                <span className="text-muted-foreground/40 normal-case tracking-normal"> (optional)</span>
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={4}
                className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md resize-none"
                placeholder="Add an optional extended description..."
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setSquashDialogOpen(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSquashConfirm}
              disabled={isPending || !commitTitle.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 border border-foreground/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <GitMerge className="w-3 h-3" />
              )}
              Confirm squash and merge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
