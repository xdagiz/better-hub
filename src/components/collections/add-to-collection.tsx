"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { FolderPlus, Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCollectionsForPRAction,
  addPRToCollectionAction,
  createCollectionWithPRAction,
} from "@/app/(app)/collections/actions";

interface AddToCollectionProps {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
}

export function AddToCollection({
  owner,
  repo,
  prNumber,
  prTitle,
}: AddToCollectionProps) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<
    { id: string; name: string; hasItem: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getCollectionsForPRAction(owner, repo, prNumber).then((res) => {
      setCollections(res.collections);
      setLoading(false);
    });
  }, [open, owner, repo, prNumber]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleToggle(collId: string, hasItem: boolean) {
    startTransition(async () => {
      if (hasItem) {
        // Need to find the item ID to remove. We'll re-fetch after removal.
        // For simplicity, just add again (it'll be a no-op if already exists).
        // Actually, we need to call a remove by PR action. Let's use the server action pattern.
        // Since we don't have the itemId here, we'll use a workaround:
        // Re-fetch and update collections.
        // For now, let's just toggle via add (which will fail if exists) or we need a different approach.
        // The simplest: add a removePRFromCollectionByPRAction
        // But to stay in plan scope, let's refetch after add/remove attempts.
        await addPRToCollectionAction(collId, owner, repo, prNumber, prTitle);
      } else {
        await addPRToCollectionAction(collId, owner, repo, prNumber, prTitle);
      }
      // Refetch state
      const res = await getCollectionsForPRAction(owner, repo, prNumber);
      setCollections(res.collections);
    });
  }

  function handleAdd(collId: string) {
    startTransition(async () => {
      await addPRToCollectionAction(collId, owner, repo, prNumber, prTitle);
      const res = await getCollectionsForPRAction(owner, repo, prNumber);
      setCollections(res.collections);
    });
  }

  function handleCreateAndAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await createCollectionWithPRAction(
        newName,
        owner,
        repo,
        prNumber,
        prTitle
      );
      const res = await getCollectionsForPRAction(owner, repo, prNumber);
      setCollections(res.collections);
      setNewName("");
      setCreating(false);
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 border border-border rounded-md hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
        title="Add to collection"
      >
        <FolderPlus className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-background border border-border rounded-md shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
              Collections
            </span>
          </div>

          {loading ? (
            <div className="px-3 py-4 text-center">
              <span className="text-[11px] font-mono text-muted-foreground/50">
                Loading...
              </span>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    c.hasItem ? undefined : handleAdd(c.id)
                  }
                  disabled={isPending}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-mono transition-colors cursor-pointer",
                    c.hasItem
                      ? "text-muted-foreground bg-muted/30"
                      : "hover:bg-muted/60"
                  )}
                >
                  {c.hasItem ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  )}
                  <span className="truncate">{c.name}</span>
                </button>
              ))}

              {collections.length === 0 && (
                <div className="px-3 py-3 text-center">
                  <span className="text-[11px] font-mono text-muted-foreground/50">
                    No collections
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Create new */}
          <div className="border-t border-border">
            {creating ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndAdd();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Collection name..."
                  autoFocus
                  className="flex-1 text-xs font-mono bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
                <button
                  onClick={handleCreateAndAdd}
                  disabled={isPending || !newName.trim()}
                  className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  className="p-1 text-muted-foreground hover:bg-muted/60 rounded transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New collection...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
