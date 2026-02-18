"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type FileTreeNode } from "@/lib/file-tree";
import { parseRefAndPath } from "@/lib/github-utils";
import { FileExplorerTree } from "./file-explorer-tree";
import { BranchSelector } from "./branch-selector";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { cn } from "@/lib/utils";

interface CodeContentWrapperProps {
  owner: string;
  repo: string;
  defaultBranch: string;
  tree: FileTreeNode[] | null;
  branches: { name: string }[];
  tags: { name: string }[];
  children: React.ReactNode;
}

export function CodeContentWrapper({
  owner,
  repo,
  defaultBranch,
  tree,
  branches,
  tags,
  children,
}: CodeContentWrapperProps) {
  const pathname = usePathname();
  const base = `/repos/${owner}/${repo}`;

  const isCodeRoute =
    pathname === base ||
    pathname.startsWith(`${base}/tree`) ||
    pathname.startsWith(`${base}/blob`);

  // Detail routes (e.g. /pulls/123, /issues/5, /people/username) manage their own scrolling
  const isDetailRoute =
    /\/pulls\/\d+/.test(pathname) || /\/issues\/\d+/.test(pathname) || /\/people\/[^/]+$/.test(pathname);

  const showTree = isCodeRoute && tree !== null;

  const isBlobOrTree =
    pathname.startsWith(`${base}/blob`) ||
    pathname.startsWith(`${base}/tree`);

  // Parse ref and path from URL for blob/tree routes
  const { currentRef, currentPath, pathType } = useMemo(() => {
    if (!isBlobOrTree) {
      return { currentRef: defaultBranch, currentPath: "", pathType: "tree" as const };
    }

    const blobPrefix = `${base}/blob/`;
    const treePrefix = `${base}/tree/`;
    let rawPath: string;
    let type: "blob" | "tree";

    if (pathname.startsWith(blobPrefix)) {
      rawPath = decodeURIComponent(pathname.slice(blobPrefix.length));
      type = "blob";
    } else {
      rawPath = decodeURIComponent(pathname.slice(treePrefix.length));
      type = "tree";
    }

    const segments = rawPath.split("/").filter(Boolean);
    const branchNames = [
      ...branches.map((b) => b.name),
      ...tags.map((t) => t.name),
    ];
    const { ref, path } = parseRefAndPath(segments, branchNames);

    return { currentRef: ref, currentPath: path, pathType: type };
  }, [pathname, base, isBlobOrTree, branches, tags, defaultBranch]);

  return (
    <div className="flex flex-1 min-h-0">
      {showTree && (
        <div className="hidden lg:flex w-[240px] shrink-0 border-r border-border flex-col min-h-0 overflow-hidden">
          <FileExplorerTree
            tree={tree}
            owner={owner}
            repo={repo}
            defaultBranch={defaultBranch}
          />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {isBlobOrTree && (
          <div className="shrink-0 px-4 pt-3 pb-1 flex items-center gap-3">
            <BranchSelector
              owner={owner}
              repo={repo}
              currentRef={currentRef}
              branches={branches}
              tags={tags}
              currentPath={currentPath}
              pathType={pathType}
            />
            <BreadcrumbNav
              owner={owner}
              repo={repo}
              currentRef={currentRef}
              path={currentPath}
              isFile={pathType === "blob"}
            />
          </div>
        )}
        <div
          className={cn(
            "flex-1 min-h-0",
            isDetailRoute
              ? "flex flex-col overflow-hidden px-4 pt-3"
              : cn("overflow-y-auto px-4 pb-4", isBlobOrTree ? "pt-2" : "pt-3")
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
