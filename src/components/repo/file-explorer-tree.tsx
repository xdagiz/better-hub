"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search, X } from "lucide-react";
import { FileTypeIcon } from "@/components/shared/file-icon";
import { cn } from "@/lib/utils";
import { encodeFilePath } from "@/lib/github-utils";
import { type FileTreeNode, getAncestorPaths } from "@/lib/file-tree";

interface FileExplorerTreeProps {
  tree: FileTreeNode[];
  owner: string;
  repo: string;
  defaultBranch: string;
}

export function FileExplorerTree({
  tree,
  owner,
  repo,
  defaultBranch,
}: FileExplorerTreeProps) {
  const pathname = usePathname();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const deferredQuery = useDeferredValue(filterQuery);
  const isStale = deferredQuery !== filterQuery;

  // Determine the current file/dir path from the URL
  const currentPath = useMemo(() => {
    const base = `/repos/${owner}/${repo}`;
    const blobPrefix = `${base}/blob/${defaultBranch}/`;
    const treePrefix = `${base}/tree/${defaultBranch}/`;

    if (pathname.startsWith(blobPrefix)) {
      return decodeURIComponent(pathname.slice(blobPrefix.length));
    }
    if (pathname.startsWith(treePrefix)) {
      return decodeURIComponent(pathname.slice(treePrefix.length));
    }
    return null;
  }, [pathname, owner, repo, defaultBranch]);

  // Auto-expand ancestors of the current path
  useEffect(() => {
    if (!currentPath) return;
    const ancestors = getAncestorPaths(currentPath);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const a of ancestors) next.add(a);
      next.add(currentPath);
      return next;
    });
  }, [currentPath]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Filter tree using the deferred (non-blocking) query
  const filteredTree = useMemo(() => {
    if (!deferredQuery.trim()) return tree;
    const query = deferredQuery.toLowerCase();

    function filterNodes(nodes: FileTreeNode[]): FileTreeNode[] {
      const result: FileTreeNode[] = [];
      for (const node of nodes) {
        if (node.type === "file") {
          if (
            node.name.toLowerCase().includes(query) ||
            node.path.toLowerCase().includes(query)
          ) {
            result.push(node);
          }
        } else if (node.children) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0) {
            result.push({ ...node, children: filteredChildren });
          }
        }
      }
      return result;
    }

    return filterNodes(tree);
  }, [tree, deferredQuery]);

  // When filtering, auto-expand all dirs in filtered results
  const effectiveExpanded = useMemo(() => {
    if (!deferredQuery.trim()) return expandedPaths;
    const allDirs = new Set(expandedPaths);
    function collectDirs(nodes: FileTreeNode[]) {
      for (const node of nodes) {
        if (node.type === "dir") {
          allDirs.add(node.path);
          if (node.children) collectDirs(node.children);
        }
      }
    }
    collectDirs(filteredTree);
    return allDirs;
  }, [filteredTree, deferredQuery, expandedPaths]);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full text-[11px] font-mono pl-7 pr-7 py-1.5 bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-zinc-400/30 dark:focus:ring-zinc-600/30 placeholder:text-muted-foreground/50"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-1 transition-opacity duration-100",
          isStale && "opacity-60"
        )}
      >
        {filteredTree.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 font-mono px-3 py-2">
            No matches
          </p>
        ) : (
          filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              owner={owner}
              repo={repo}
              defaultBranch={defaultBranch}
              currentPath={currentPath}
              expandedPaths={effectiveExpanded}
              onToggle={toggleExpand}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  owner: string;
  repo: string;
  defaultBranch: string;
  currentPath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}

function TreeNode({
  node,
  depth,
  owner,
  repo,
  defaultBranch,
  currentPath,
  expandedPaths,
  onToggle,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = currentPath === node.path;
  const paddingLeft = depth * 16 + 8;

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => onToggle(node.path)}
          className={cn(
            "flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors group relative",
            isActive && "bg-muted/70 dark:bg-white/[0.04]"
          )}
          style={{ paddingLeft }}
        >
          {/* Indent guides */}
          {Array.from({ length: depth }).map((_, i) => (
            <span
              key={i}
              className="absolute top-0 bottom-0 w-px bg-zinc-200/60 dark:bg-zinc-800/60"
              style={{ left: i * 16 + 16 }}
            />
          ))}
          <ChevronRight
            className={cn(
              "w-3 h-3 text-muted-foreground/50 shrink-0 transition-transform duration-150",
              isExpanded && "rotate-90"
            )}
          />
          <FileTypeIcon
            name={node.name}
            type="dir"
            className="w-3.5 h-3.5 shrink-0"
            isOpen={isExpanded}
          />
          <span className="text-[12px] font-mono truncate">{node.name}</span>
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-150 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                owner={owner}
                repo={repo}
                defaultBranch={defaultBranch}
                currentPath={currentPath}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/repos/${owner}/${repo}/blob/${defaultBranch}/${encodeFilePath(node.path)}`}
      prefetch={true}
      className={cn(
        "flex items-center gap-1.5 py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors relative",
        isActive && "bg-muted/70 dark:bg-white/[0.04]"
      )}
      style={{ paddingLeft: paddingLeft + 15 }}
    >
      {/* Indent guides */}
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 w-px bg-zinc-200/60 dark:bg-zinc-800/60"
          style={{ left: i * 16 + 16 }}
        />
      ))}
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground" />
      )}
      <FileTypeIcon
        name={node.name}
        type="file"
        className="w-4 h-4 shrink-0"
      />
      <span className="text-[12px] font-mono truncate">{node.name}</span>
    </Link>
  );
}
