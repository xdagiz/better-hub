"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  GitPullRequest,
  GitMerge,
  XCircle,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toggleReviewedAction,
  removePRFromCollectionAction,
} from "@/app/(app)/collections/actions";

interface CollectionItemData {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  reviewed: boolean;
  position: number;
  state: string | null;
  merged: boolean;
  draft: boolean;
}

export function CollectionDetail({
  collection,
  items,
}: {
  collection: { id: string; name: string };
  items: CollectionItemData[];
}) {
  const reviewedCount = items.filter((i) => i.reviewed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <Link
          href="/collections"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Collections
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium tracking-tight">
            {collection.name}
          </h1>
          <span className="text-[11px] font-mono text-muted-foreground/60 px-2 py-0.5 border border-border rounded-sm">
            {reviewedCount}/{totalCount} reviewed
          </span>
        </div>
        {totalCount > 0 && (
          <div className="mt-2 h-1 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-full overflow-hidden max-w-[300px]">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress === 100 ? "bg-emerald-500" : "bg-foreground/30"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* PR List */}
      <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {items.map((item) => (
          <CollectionItemRow
            key={item.id}
            item={item}
            collectionId={collection.id}
          />
        ))}

        {items.length === 0 && (
          <div className="py-16 text-center">
            <GitPullRequest className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              No PRs in this collection yet
            </p>
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
              Add PRs from any pull request detail page
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionItemRow({
  item,
  collectionId,
}: {
  item: CollectionItemData;
  collectionId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleReviewedAction(item.id, !item.reviewed, collectionId);
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removePRFromCollectionAction(item.id, collectionId);
      router.refresh();
    });
  }

  const StatusIcon = item.merged
    ? GitMerge
    : item.state === "closed"
      ? XCircle
      : GitPullRequest;

  const statusColor = item.merged
    ? "text-purple-400"
    : item.state === "closed"
      ? "text-red-400"
      : item.draft
        ? "text-muted-foreground/50"
        : "text-success";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors",
        isPending && "opacity-60"
      )}
    >
      {/* Reviewed toggle */}
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
      >
        {item.reviewed ? (
          <CheckSquare className="w-4 h-4 text-emerald-500" />
        ) : (
          <Square className="w-4 h-4" />
        )}
      </button>

      {/* PR status icon */}
      <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", statusColor)} />

      {/* PR info */}
      <Link
        href={`/repos/${item.owner}/${item.repo}/pulls/${item.prNumber}?collection=${collectionId}`}
        className="flex-1 min-w-0"
      >
        <span
          className={cn(
            "text-sm font-mono truncate block hover:text-foreground transition-colors",
            item.reviewed
              ? "text-muted-foreground line-through decoration-muted-foreground/30"
              : "text-foreground"
          )}
        >
          {item.prTitle}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground/60 mt-0.5 block">
          {item.owner}/{item.repo}#{item.prNumber}
        </span>
      </Link>

      {/* Draft badge */}
      {item.draft && (
        <span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 shrink-0 rounded-sm">
          Draft
        </span>
      )}

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="shrink-0 p-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
