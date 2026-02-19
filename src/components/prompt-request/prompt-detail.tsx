"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  GitPullRequest,
  Sparkles,
  Check,
  X,
  Trash2,
  Loader2,
  RotateCcw,
  Play,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  acceptPromptRequest,
  rejectPromptRequest,
  resetPromptRequest,
  deletePromptRequestAction,
} from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import type { PromptRequest, PromptRequestStatus } from "@/lib/prompt-request-store";

const statusColors: Record<PromptRequestStatus, string> = {
  open: "bg-green-500/15 text-green-400",
  processing: "bg-yellow-500/15 text-yellow-400",
  completed: "bg-purple-500/15 text-purple-400",
  rejected: "bg-red-500/15 text-red-400",
};

const statusLabels: Record<PromptRequestStatus, string> = {
  open: "Open",
  processing: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

interface PromptDetailProps {
  owner: string;
  repo: string;
  promptRequest: PromptRequest;
}

export function PromptDetail({ owner, repo, promptRequest }: PromptDetailProps) {
  const router = useRouter();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(promptRequest.errorMessage);

  // Poll for status changes while processing
  const isProcessing = promptRequest.status === "processing";
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      pollRef.current = setInterval(() => {
        router.refresh();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isProcessing, router]);

  const startProcessing = async (id: string) => {
    setError(null);
    const res = await fetch("/api/ai/prompt-process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptRequestId: id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start processing");
    }
  };

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await acceptPromptRequest(promptRequest.id);
      await startProcessing(promptRequest.id);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Failed to accept");
      setIsAccepting(false);
    }
  };

  const handleResume = async () => {
    setIsAccepting(true);
    try {
      await startProcessing(promptRequest.id);
      router.refresh();
    } catch (e: any) {
      setError(e.message || "Failed to resume");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetPromptRequest(promptRequest.id);
      setError(null);
      router.refresh();
    } catch {
      setIsResetting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await rejectPromptRequest(promptRequest.id);
      router.refresh();
    } catch {
      setIsRejecting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this prompt request?")) return;
    setIsDeleting(true);
    try {
      await deletePromptRequestAction(promptRequest.id);
      router.push(`/${owner}/${repo}/prompts`);
    } catch {
      setIsDeleting(false);
    }
  };

  const isOpen = promptRequest.status === "open";

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href={`/${owner}/${repo}/prompts`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to prompts
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-muted-foreground/40 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium text-foreground leading-tight">
              {promptRequest.title}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={cn(
                  "text-[11px] font-mono px-2 py-0.5 rounded-full",
                  statusColors[promptRequest.status]
                )}
              >
                {statusLabels[promptRequest.status]}
              </span>
              <span className="text-[11px] text-muted-foreground/50 font-mono">
                Created <TimeAgo date={promptRequest.createdAt} />
              </span>
              {promptRequest.updatedAt !== promptRequest.createdAt && (
                <span className="text-[11px] text-muted-foreground/40 font-mono">
                  Updated <TimeAgo date={promptRequest.updatedAt} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Linked PR */}
        {promptRequest.prNumber && (
          <Link
            href={`/${owner}/${repo}/pulls/${promptRequest.prNumber}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-purple-400 bg-purple-500/10 rounded-md hover:bg-purple-500/15 transition-colors"
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            Pull Request #{promptRequest.prNumber}
          </Link>
        )}
      </div>

      {/* Error message */}
      {(error || promptRequest.errorMessage) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400/90 font-mono leading-relaxed">
            {error || promptRequest.errorMessage}
          </p>
        </div>
      )}

      {/* Body */}
      <div className="border border-border rounded-lg p-4">
        <ClientMarkdown content={promptRequest.body} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        {isOpen && (
          <>
            <button
              onClick={handleAccept}
              disabled={isAccepting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors disabled:opacity-50"
            >
              {isAccepting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Accept & Process
            </button>
            <button
              onClick={handleReject}
              disabled={isRejecting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {isRejecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Reject
            </button>
          </>
        )}
        {isProcessing && (
          <>
            <div className="flex items-center gap-2 text-xs text-yellow-400 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Ghost is processing in the background...
            </div>
            <button
              onClick={handleResume}
              disabled={isAccepting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {isAccepting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Retry
            </button>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {isResetting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              Reset
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
          Delete
        </button>
      </div>
    </div>
  );
}
