"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleReviewedAction } from "@/app/(app)/collections/actions";

interface CollectionNavBarProps {
  collectionId: string;
  collectionName: string;
  currentIndex: number;
  totalItems: number;
  currentItemId: string;
  currentReviewed: boolean;
  prevHref: string | null;
  nextHref: string | null;
}

export function CollectionNavBar({
  collectionId,
  collectionName,
  currentIndex,
  totalItems,
  currentItemId,
  currentReviewed,
  prevHref,
  nextHref,
}: CollectionNavBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleReviewedAction(
        currentItemId,
        !currentReviewed,
        collectionId
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 mb-3 border border-border rounded-md bg-muted/30">
      {/* Collection link */}
      <Link
        href={`/collections/${collectionId}`}
        className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        {collectionName}
      </Link>

      <span className="w-px h-4 bg-border" />

      {/* Position */}
      <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0">
        PR {currentIndex + 1} of {totalItems}
      </span>

      {/* Navigation */}
      <div className="flex items-center gap-1 ml-auto">
        {prevHref ? (
          <Link
            href={prevHref}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="p-1 text-muted-foreground/30">
            <ArrowLeft className="w-3.5 h-3.5" />
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="p-1 text-muted-foreground/30">
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      <span className="w-px h-4 bg-border" />

      {/* Reviewed toggle */}
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded transition-colors cursor-pointer shrink-0",
          currentReviewed
            ? "text-emerald-500 hover:bg-emerald-500/10"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        {currentReviewed ? (
          <CheckSquare className="w-3.5 h-3.5" />
        ) : (
          <Square className="w-3.5 h-3.5" />
        )}
        {currentReviewed ? "Reviewed" : "Mark reviewed"}
      </button>
    </div>
  );
}
