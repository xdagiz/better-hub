"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import {
  createCollectionAction,
  renameCollectionAction,
  deleteCollectionAction,
} from "@/app/(app)/collections/actions";

interface CollectionSummary {
  id: string;
  name: string;
  totalItems: number;
  reviewedItems: number;
  updatedAt: string;
}

export function CollectionsContent({
  collections,
}: {
  collections: CollectionSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await createCollectionAction(newName);
      setNewName("");
      setCreating(false);
      router.refresh();
    });
  }

  function handleRename(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await renameCollectionAction(id, editName);
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCollectionAction(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground/70 mt-0.5">
            Group related PRs for gradual review
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 border border-border rounded-md hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        )}
      </div>

      {/* Create input */}
      {creating && (
        <div className="shrink-0 mb-4 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="Collection name..."
            autoFocus
            className="flex-1 text-sm font-mono bg-transparent border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
          <button
            onClick={handleCreate}
            disabled={isPending || !newName.trim()}
            className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="p-1.5 text-muted-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {collections.map((c) => {
          const progress =
            c.totalItems > 0 ? (c.reviewedItems / c.totalItems) * 100 : 0;

          if (editingId === c.id) {
            return (
              <div key={c.id} className="flex items-center gap-2 px-4 py-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 text-sm font-mono bg-transparent border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
                <button
                  onClick={() => handleRename(c.id)}
                  disabled={isPending || !editName.trim()}
                  className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="p-1.5 text-muted-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={c.id}
              className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
            >
              <Link
                href={`/collections/${c.id}`}
                className="flex-1 min-w-0 flex items-center gap-3"
              >
                <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground/60" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-foreground truncate">
                      {c.name}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground/60 px-1.5 py-0.5 border border-border rounded-sm shrink-0">
                      {c.reviewedItems}/{c.totalItems}
                    </span>
                  </div>
                  {c.totalItems > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-full overflow-hidden max-w-[200px]">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            progress === 100
                              ? "bg-emerald-500"
                              : "bg-foreground/30"
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {timeAgo(c.updatedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </Link>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(c.id);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {collections.length === 0 && !creating && (
          <div className="py-16 text-center">
            <FolderOpen className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono mb-3">
              No collections yet
            </p>
            <button
              onClick={() => setCreating(true)}
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Create your first collection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
