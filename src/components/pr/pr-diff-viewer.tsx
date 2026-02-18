"use client";

import { useState, useTransition, useRef, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  parseDiffPatch,
  parseHunkHeader,
  type DiffLine,
  type DiffSegment,
} from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";
import { cn, timeAgo } from "@/lib/utils";
import Image from "next/image";
import {
  File,
  FileText,
  FilePlus2,
  FileX2,
  FileEdit,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  WrapText,
  Plus,
  X,
  Loader2,
  CornerDownLeft,
  Eye,
  EyeOff,
  Code2,
  Lightbulb,
  Check,
  CheckCircle2,
  Circle,
  MessageSquare,
  UnfoldVertical,
  FileCode,
  Ghost,
  GitCommitHorizontal,
} from "lucide-react";
import {
  addPRReviewComment,
  commitSuggestion,
  resolveReviewThread,
  unresolveReviewThread,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { MarkdownEditor, type MarkdownEditorRef } from "@/components/shared/markdown-editor";
import type { ReviewThread } from "@/lib/github";
import { ClientMarkdown } from "@/components/shared/client-markdown";

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

interface ReviewComment {
  id: number;
  user: { login: string; avatar_url: string } | null;
  body: string;
  path: string;
  line: number | null;
  start_line?: number | null;
  original_line: number | null;
  side: string | null;
  created_at: string;
}

interface ReviewSummary {
  id: number;
  user: { login: string; avatar_url: string } | null;
  state: string;
  submitted_at: string | null;
}

interface PRCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
}

interface PRDiffViewerProps {
  files: DiffFile[];
  reviewComments?: ReviewComment[];
  reviewThreads?: ReviewThread[];
  reviewSummaries?: ReviewSummary[];
  commits?: PRCommit[];
  owner?: string;
  repo?: string;
  pullNumber?: number;
  headSha?: string;
  headBranch?: string;
  canWrite?: boolean;
  highlightData?: Record<string, Record<string, SyntaxToken[]>>;
  participants?: Array<{ login: string; avatar_url: string }>;
}

type AddContextCallback = (context: {
  filename: string;
  startLine: number;
  endLine: number;
  selectedCode: string;
  side: "LEFT" | "RIGHT";
}) => void;

type SidebarMode = "files" | "reviews" | "commits";

export function PRDiffViewer({
  files,
  reviewComments = [],
  reviewThreads = [],
  reviewSummaries = [],
  commits = [],
  owner,
  repo,
  pullNumber,
  headSha,
  headBranch,
  canWrite = true,
  highlightData = {},
  participants,
}: PRDiffViewerProps) {
  const globalChat = useGlobalChatOptional();
  const onAddContext = globalChat?.addCodeContext;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Resolve initial index from ?file= query param
  const [activeIndex, setActiveIndex] = useState(() => {
    const fileParam = searchParams.get("file");
    if (fileParam) {
      const idx = files.findIndex((f) => f.filename === fileParam);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [wordWrap, setWordWrap] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [isDragging, setIsDragging] = useState(false);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("files");
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  const currentFile = files[activeIndex];

  // Sync active file to URL ?file= param (only when activeIndex changes)
  const prevIndexRef = useRef(activeIndex);
  useEffect(() => {
    if (!currentFile) return;
    if (prevIndexRef.current === activeIndex && searchParams.get("file") === currentFile.filename) return;
    prevIndexRef.current = activeIndex;
    const url = new URL(window.location.href);
    url.searchParams.set("file", currentFile.filename);
    window.history.replaceState(null, "", url.toString());
  }, [activeIndex, currentFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToPrev = useCallback(
    () => setActiveIndex((i) => Math.max(0, i - 1)),
    []
  );
  const goToNext = useCallback(
    () => setActiveIndex((i) => Math.min(files.length - 1, i + 1)),
    [files.length]
  );

  const toggleViewed = (filename: string) => {
    setViewedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const viewedCount = viewedFiles.size;

  // Group review comments by file
  const commentsByFile = new Map<string, ReviewComment[]>();
  for (const rc of reviewComments) {
    const existing = commentsByFile.get(rc.path) || [];
    existing.push(rc);
    commentsByFile.set(rc.path, existing);
  }

  // Group review threads by file
  const threadsByFile = new Map<string, ReviewThread[]>();
  for (const t of reviewThreads) {
    const existing = threadsByFile.get(t.path) || [];
    existing.push(t);
    threadsByFile.set(t.path, existing);
  }

  const unresolvedThreadCount = reviewThreads.filter((t) => !t.isResolved).length;

  const handleSidebarResize = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      setSidebarWidth(Math.max(140, Math.min(400, x)));
    },
    []
  );

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 min-w-0">
      {/* File sidebar */}
      <div
        className="hidden lg:flex flex-col shrink-0 border-r border-border"
        style={{
          width: sidebarWidth,
          transition: isDragging ? "none" : "width 0.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Sidebar header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2">
          <span className="text-[11px] font-mono text-foreground font-medium">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] font-mono text-emerald-500">
            +{totalAdditions}
          </span>
          <span className="text-[10px] font-mono text-red-400">
            -{totalDeletions}
          </span>
          {viewedCount > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/60">
              {viewedCount}/{files.length}
            </span>
          )}
          <div className="flex items-center gap-0.5 ml-auto">
            <button
              onClick={() => setSidebarMode("files")}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer",
                sidebarMode === "files"
                  ? "text-foreground bg-zinc-200/60 dark:bg-zinc-700/50"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              title="Files"
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSidebarMode("reviews")}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer relative",
                sidebarMode === "reviews"
                  ? "text-foreground bg-zinc-200/60 dark:bg-zinc-700/50"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              title="Reviews"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {unresolvedThreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  {unresolvedThreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setSidebarMode("commits")}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer relative",
                sidebarMode === "commits"
                  ? "text-foreground bg-zinc-200/60 dark:bg-zinc-700/50"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              title="Commits"
            >
              <GitCommitHorizontal className="w-3.5 h-3.5" />
              {commits.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  {commits.length}
                </span>
              )}
            </button>
          </div>
        </div>
        {viewedCount > 0 && (
          <div className="shrink-0 h-1 bg-zinc-200/60 dark:bg-zinc-800/60 mx-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 transition-all duration-300 rounded-full"
              style={{ width: `${(viewedCount / files.length) * 100}%` }}
            />
          </div>
        )}

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto py-1">
          {sidebarMode === "files" ? (
            <>
              {files.map((file, i) => {
                const name = file.filename.split("/").pop() || file.filename;
                const dir = file.filename.includes("/")
                  ? file.filename.slice(0, file.filename.lastIndexOf("/"))
                  : "";
                const Icon = getFileIcon(file.status);
                const isViewed = viewedFiles.has(file.filename);
                const fileThreads = threadsByFile.get(file.filename);

                return (
                  <button
                    key={file.filename}
                    onClick={() => setActiveIndex(i)}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-3 py-1 text-left transition-colors cursor-pointer group/file",
                      activeIndex === i
                        ? "bg-zinc-100/80 dark:bg-zinc-800/40"
                        : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20",
                      isViewed && "opacity-50"
                    )}
                  >
                    {isViewed ? (
                      <Check className="w-3 h-3 shrink-0 text-emerald-500" />
                    ) : (
                      <Icon
                        className={cn(
                          "w-3 h-3 shrink-0",
                          getFileIconColor(file.status)
                        )}
                      />
                    )}
                    <div className="flex-1 min-w-0 truncate">
                      <span className={cn(
                        "text-[11px] font-mono group-hover/file:text-foreground",
                        isViewed ? "text-muted-foreground/60 line-through" : "text-foreground/80"
                      )}>
                        {name}
                      </span>
                      {dir && (
                        <span className="block text-[9px] font-mono text-muted-foreground/50 truncate">
                          {dir}
                        </span>
                      )}
                    </div>
                    {fileThreads && fileThreads.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" title={`${fileThreads.length} review thread${fileThreads.length !== 1 ? "s" : ""}`} />
                    )}
                    <span className="text-[10px] font-mono text-emerald-500 tabular-nums shrink-0">
                      +{file.additions}
                    </span>
                    <span className="text-[10px] font-mono text-red-400 tabular-nums shrink-0">
                      -{file.deletions}
                    </span>
                  </button>
                );
              })}
            </>
          ) : sidebarMode === "commits" ? (
            <SidebarCommits commits={commits} owner={owner} repo={repo} />
          ) : (
            <SidebarReviews
              files={files}
              threadsByFile={threadsByFile}
              reviewSummaries={reviewSummaries}
              onNavigateToFile={(i, line) => {
                setActiveIndex(i);
                setScrollToLine(line ?? null);
              }}
              owner={owner}
              repo={repo}
              pullNumber={pullNumber}
            />
          )}
        </div>
      </div>

      {/* Sidebar resize handle */}
      <div className="hidden lg:flex shrink-0">
        <ResizeHandle
          onResize={handleSidebarResize}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
          onDoubleClick={() => setSidebarWidth(220)}
        />
      </div>

      {/* Single file diff view */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {currentFile && (
          <SingleFileDiff
            file={currentFile}
            index={activeIndex}
            total={files.length}
            wordWrap={wordWrap}
            onToggleWrap={() => setWordWrap((w) => !w)}
            onPrev={goToPrev}
            onNext={goToNext}
            fileComments={commentsByFile.get(currentFile.filename) || []}
            viewed={viewedFiles.has(currentFile.filename)}
            onToggleViewed={() => toggleViewed(currentFile.filename)}
            owner={owner}
            repo={repo}
            pullNumber={pullNumber}
            headSha={headSha}
            headBranch={headBranch}
            scrollToLine={scrollToLine}
            onScrollComplete={() => setScrollToLine(null)}
            canWrite={canWrite}
            fileHighlightData={highlightData[currentFile.filename]}
            onAddContext={onAddContext}
            participants={participants}
          />
        )}
      </div>
    </div>
  );
}

function SingleFileDiff({
  file,
  index,
  total,
  wordWrap,
  onToggleWrap,
  onPrev,
  onNext,
  fileComments,
  viewed,
  onToggleViewed,
  owner,
  repo,
  pullNumber,
  headSha,
  headBranch,
  scrollToLine,
  onScrollComplete,
  canWrite = true,
  fileHighlightData,
  onAddContext,
  participants,
}: {
  file: DiffFile;
  index: number;
  total: number;
  wordWrap: boolean;
  onToggleWrap: () => void;
  onPrev: () => void;
  onNext: () => void;
  fileComments: ReviewComment[];
  viewed: boolean;
  onToggleViewed: () => void;
  owner?: string;
  repo?: string;
  pullNumber?: number;
  headSha?: string;
  headBranch?: string;
  scrollToLine?: number | null;
  onScrollComplete?: () => void;
  canWrite?: boolean;
  fileHighlightData?: Record<string, SyntaxToken[]>;
  onAddContext?: AddContextCallback;
  participants?: Array<{ login: string; avatar_url: string }>;
}) {
  const lines = file.patch ? parseDiffPatch(file.patch) : [];
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const overscrollRef = useRef(0);
  const overscrollCooldown = useRef(false);

  // Reset overscroll accumulator when file changes
  useEffect(() => {
    overscrollRef.current = 0;
    overscrollCooldown.current = false;
  }, [index]);

  // Overscroll → navigate to next/prev file
  useEffect(() => {
    const el = diffContainerRef.current;
    if (!el) return;
    const THRESHOLD = 150; // px of accumulated overscroll before navigating

    const handleWheel = (e: WheelEvent) => {
      if (overscrollCooldown.current) return;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const atTop = el.scrollTop <= 1;

      if (e.deltaY > 0 && atBottom && index < total - 1) {
        overscrollRef.current += e.deltaY;
        if (overscrollRef.current >= THRESHOLD) {
          overscrollCooldown.current = true;
          overscrollRef.current = 0;
          onNext();
          setTimeout(() => { overscrollCooldown.current = false; }, 300);
        }
      } else if (e.deltaY < 0 && atTop && index > 0) {
        overscrollRef.current += Math.abs(e.deltaY);
        if (overscrollRef.current >= THRESHOLD) {
          overscrollCooldown.current = true;
          overscrollRef.current = 0;
          onPrev();
          setTimeout(() => { overscrollCooldown.current = false; }, 300);
        }
      } else {
        overscrollRef.current = 0;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [index, total, onNext, onPrev]);

  useEffect(() => {
    if (scrollToLine == null || !diffContainerRef.current) return;
    const row = diffContainerRef.current.querySelector(`[data-line="${scrollToLine}"]`);
    if (row) {
      // Small delay to let the file render
      requestAnimationFrame(() => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        // Brief highlight
        row.classList.add("!bg-amber-500/10");
        setTimeout(() => row.classList.remove("!bg-amber-500/10"), 2000);
      });
    }
    onScrollComplete?.();
  }, [scrollToLine, onScrollComplete]);
  const [commentRange, setCommentRange] = useState<{
    startLine: number;
    endLine: number;
    side: "LEFT" | "RIGHT";
  } | null>(null);
  // Track which line the user started clicking on for drag-select
  const [selectingFrom, setSelectingFrom] = useState<{
    line: number;
    side: "LEFT" | "RIGHT";
  } | null>(null);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const hoverLineRef = useRef<number | null>(null);
  const selectingFromRef = useRef<{ line: number; side: "LEFT" | "RIGHT" } | null>(null);

  // Expand context & full file view state
  const [expandedLines, setExpandedLines] = useState<Map<number, string[]>>(new Map());
  const [fileContent, setFileContent] = useState<string[] | null>(null);
  const [fullFileTokens, setFullFileTokens] = useState<SyntaxToken[][] | null>(null);
  const [isLoadingExpand, setIsLoadingExpand] = useState<number | null>(null);
  const [showFullFile, setShowFullFile] = useState(false);
  const [isLoadingFullFile, setIsLoadingFullFile] = useState(false);

  // Compute hunk info for expand context
  const hunkInfos = lines.reduce<{ index: number; newStart: number; newCount: number; endNewLine: number }[]>(
    (acc, line, i) => {
      if (line.type === "header") {
        const parsed = parseHunkHeader(line.content);
        if (parsed) {
          acc.push({ index: i, newStart: parsed.newStart, newCount: parsed.newCount, endNewLine: parsed.newStart + parsed.newCount - 1 });
        }
      }
      return acc;
    },
    []
  );

  const fetchFileContent = useCallback(async (withHighlight = false): Promise<string[] | null> => {
    if (fileContent && (!withHighlight || fullFileTokens)) return fileContent;
    if (!owner || !repo || !headSha) return null;
    try {
      const url = `/api/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(file.filename)}&ref=${encodeURIComponent(headSha)}${withHighlight ? "&highlight=true" : ""}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const contentLines = (data.content as string).split("\n");
      setFileContent(contentLines);
      if (data.tokens) {
        setFullFileTokens(data.tokens);
      }
      return contentLines;
    } catch {
      return null;
    }
  }, [fileContent, fullFileTokens, owner, repo, headSha, file.filename]);

  const handleExpandHunk = useCallback(async (hunkIdx: number) => {
    setIsLoadingExpand(hunkIdx);
    const content = await fetchFileContent();
    if (!content) {
      setIsLoadingExpand(null);
      return;
    }

    // Find the gap: from end of previous hunk to start of this hunk (in new-file line numbers)
    const currentHunk = hunkInfos.find((h) => h.index === hunkIdx);
    if (!currentHunk) {
      setIsLoadingExpand(null);
      return;
    }

    // Find previous hunk's end
    const prevHunk = hunkInfos.filter((h) => h.index < hunkIdx).pop();
    const gapStart = prevHunk ? prevHunk.endNewLine + 1 : 1;
    const gapEnd = currentHunk.newStart - 1;

    if (gapEnd >= gapStart) {
      // content is 0-indexed, line numbers are 1-indexed
      const expandedContent = content.slice(gapStart - 1, gapEnd);
      setExpandedLines((prev) => {
        const next = new Map(prev);
        next.set(hunkIdx, expandedContent);
        return next;
      });
    }
    setIsLoadingExpand(null);
  }, [fetchFileContent, hunkInfos]);

  const handleToggleFullFile = useCallback(async () => {
    if (showFullFile) {
      setShowFullFile(false);
      return;
    }
    setIsLoadingFullFile(true);
    const content = await fetchFileContent(true);
    setIsLoadingFullFile(false);
    if (content) {
      setShowFullFile(true);
    }
  }, [showFullFile, fetchFileContent]);

  const dir = file.filename.includes("/")
    ? file.filename.slice(0, file.filename.lastIndexOf("/") + 1)
    : "";
  const name = file.filename.slice(dir.length);
  const FileIcon = getFileIcon(file.status);

  // Index comments by line number for quick lookup
  const commentsByLine = new Map<string, ReviewComment[]>();
  for (const c of fileComments) {
    const lineNum = c.line ?? c.original_line;
    if (lineNum !== null) {
      const key = `${c.side || "RIGHT"}-${lineNum}`;
      const existing = commentsByLine.get(key) || [];
      existing.push(c);
      commentsByLine.set(key, existing);
    }
  }

  const canComment = !!(owner && repo && pullNumber && headSha);

  // Compute the content of the selected lines for suggestion pre-fill
  const selectedLinesContent = commentRange
    ? lines
        .filter((l) => {
          if (l.type === "header") return false;
          if (commentRange.side === "LEFT") {
            // LEFT side = removed lines: match by oldLineNumber
            if (l.type !== "remove") return false;
            const ln = l.oldLineNumber;
            return ln !== undefined && ln >= commentRange.startLine && ln <= commentRange.endLine;
          } else {
            // RIGHT side = add/context lines: match by newLineNumber
            if (l.type === "remove") return false;
            const ln = l.newLineNumber;
            return ln !== undefined && ln >= commentRange.startLine && ln <= commentRange.endLine;
          }
        })
        .map((l) => l.content)
        .join("\n")
    : "";

  // Compute diff-formatted code for AI context (includes +/- markers)
  const selectedCodeForAI = commentRange
    ? (() => {
        const startLine = Math.min(commentRange.startLine, commentRange.endLine);
        const endLine = Math.max(commentRange.startLine, commentRange.endLine);
        const isLeft = commentRange.side === "LEFT";

        const matchingLines = lines.filter((l) => {
          if (l.type === "header") return false;
          if (isLeft) {
            if (l.type !== "remove") return false;
            const ln = l.oldLineNumber;
            return ln !== undefined && ln >= startLine && ln <= endLine;
          } else {
            if (l.type === "remove") return false;
            const ln = l.newLineNumber;
            return ln !== undefined && ln >= startLine && ln <= endLine;
          }
        });

        return matchingLines
          .map((l) => {
            const prefix = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
            return `${prefix} ${l.content}`;
          })
          .join("\n");
      })()
    : "";

  // Compute highlighted selection range
  const selectionRange = selectingFrom && hoverLine !== null
    ? { start: Math.min(selectingFrom.line, hoverLine), end: Math.max(selectingFrom.line, hoverLine), side: selectingFrom.side }
    : commentRange
      ? { start: Math.min(commentRange.startLine, commentRange.endLine), end: Math.max(commentRange.startLine, commentRange.endLine), side: commentRange.side }
      : null;

  const handleLineClick = (lineNum: number, side: "LEFT" | "RIGHT", shiftKey: boolean) => {
    // If we're in a drag selection, ignore click — mouseup already handled it
    if (selectingFromRef.current) return;

    if (shiftKey && commentRange) {
      // Extend existing range with shift+click
      const allLines = [commentRange.startLine, commentRange.endLine, lineNum];
      setCommentRange({
        startLine: Math.min(...allLines),
        endLine: Math.max(...allLines),
        side: commentRange.side,
      });
    } else {
      // Single line comment
      setCommentRange({ startLine: lineNum, endLine: lineNum, side });
    }
  };

  const handleLineMouseDown = (lineNum: number, side: "LEFT" | "RIGHT") => {
    // Start potential drag selection
    selectingFromRef.current = { line: lineNum, side };
    hoverLineRef.current = lineNum;
    setSelectingFrom({ line: lineNum, side });
    setHoverLine(lineNum);

    const handleMouseUp = () => {
      document.removeEventListener("mouseup", handleMouseUp);
      const from = selectingFromRef.current;
      const hover = hoverLineRef.current;
      if (from && hover !== null) {
        const startLine = Math.min(from.line, hover);
        const endLine = Math.max(from.line, hover);
        setCommentRange({ startLine, endLine, side: from.side });
      }
      selectingFromRef.current = null;
      hoverLineRef.current = null;
      setSelectingFrom(null);
      setHoverLine(null);
    };
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleLineHover = (lineNum: number) => {
    if (selectingFromRef.current) {
      hoverLineRef.current = lineNum;
      setHoverLine(lineNum);
    }
  };

  return (
    <>
      {/* Sticky file header */}
      <div className="shrink-0 sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-border">
        <FileIcon
          className={cn("w-3.5 h-3.5 shrink-0", getFileIconColor(file.status))}
        />

        <span className="text-xs font-mono truncate flex-1 min-w-0">
          {dir && <span className="text-muted-foreground/60">{dir}</span>}
          <span className="text-foreground font-medium">{name}</span>
          {file.previous_filename && (
            <span className="text-muted-foreground/50 ml-2 inline-flex items-center gap-1">
              <ArrowRight className="w-2.5 h-2.5 inline" />
              <span className="line-through">
                {file.previous_filename.split("/").pop()}
              </span>
            </span>
          )}
        </span>

        <span className="text-[11px] font-mono text-emerald-500 tabular-nums shrink-0">
          +{file.additions}
        </span>
        <span className="text-[11px] font-mono text-red-400 tabular-nums shrink-0">
          -{file.deletions}
        </span>

        {/* Viewed toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleViewed();
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors cursor-pointer shrink-0 ml-1",
            viewed
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-zinc-200/40 dark:hover:bg-zinc-700/30"
          )}
          title={viewed ? "Mark as unreviewed" : "Mark as reviewed"}
        >
          {viewed ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {viewed ? "Viewed" : "Mark viewed"}
        </button>

        {/* Full file toggle */}
        <button
          onClick={handleToggleFullFile}
          disabled={isLoadingFullFile}
          className={cn(
            "p-0.5 rounded transition-colors cursor-pointer shrink-0",
            showFullFile
              ? "bg-zinc-200/60 dark:bg-zinc-700/50 text-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-zinc-200/40 dark:hover:bg-zinc-700/30",
            "disabled:opacity-40"
          )}
          title={showFullFile ? "Show diff only" : "Show full file"}
        >
          {isLoadingFullFile ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileCode className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Wrap toggle */}
        <button
          onClick={onToggleWrap}
          className={cn(
            "p-0.5 rounded transition-colors cursor-pointer shrink-0",
            wordWrap
              ? "bg-zinc-200/60 dark:bg-zinc-700/50 text-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-zinc-200/40 dark:hover:bg-zinc-700/30"
          )}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
        >
          <WrapText className="w-3.5 h-3.5" />
        </button>

        {/* Prev / Next nav */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onPrev}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums min-w-[3ch] text-center">
            {index + 1}/{total}
          </span>
          <button
            onClick={onNext}
            disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-700/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable diff content */}
      <div
        ref={diffContainerRef}
        className={cn(
          "flex-1 overflow-y-auto",
          wordWrap ? "overflow-x-hidden" : "overflow-x-auto"
        )}
      >
        {showFullFile && fileContent ? (
          <FullFileView
            fileContent={fileContent}
            lines={lines}
            hunkInfos={hunkInfos}
            wordWrap={wordWrap}
            fileHighlightData={fileHighlightData}
            fullFileTokens={fullFileTokens}
          />
        ) : lines.length > 0 ? (
          <table
            className={cn("w-full border-collapse", wordWrap && "table-fixed")}
          >
            {wordWrap && (
              <colgroup>
                <col className="w-[3px]" />
                <col className="w-10" />
                <col />
              </colgroup>
            )}
            <tbody>
              {lines.map((line, i) => {
                const lineNum =
                  line.type === "add" || line.type === "context"
                    ? line.newLineNumber
                    : line.type === "remove"
                      ? line.oldLineNumber
                      : undefined;
                const side: "LEFT" | "RIGHT" =
                  line.type === "remove" ? "LEFT" : "RIGHT";

                // Find inline comments for this line
                const inlineComments: ReviewComment[] = [];
                if (lineNum !== undefined) {
                  const rightComments =
                    commentsByLine.get(`RIGHT-${lineNum}`) || [];
                  const leftComments =
                    commentsByLine.get(`LEFT-${lineNum}`) || [];
                  if (line.type === "remove") {
                    inlineComments.push(...leftComments);
                  } else {
                    inlineComments.push(...rightComments);
                  }
                }

                // Show comment form at end of selected range
                const isCommentFormOpen =
                  commentRange !== null &&
                  lineNum !== undefined &&
                  lineNum === commentRange.endLine &&
                  side === commentRange.side;

                // Is this line in the selection highlight? (side-aware)
                const isSelected =
                  selectionRange !== null &&
                  lineNum !== undefined &&
                  lineNum >= selectionRange.start &&
                  lineNum <= selectionRange.end &&
                  side === selectionRange.side;

                // Compute syntax highlight key for this line
                let syntaxTokens: SyntaxToken[] | undefined;
                if (fileHighlightData && lineNum !== undefined) {
                  if (line.type === "remove") {
                    syntaxTokens = fileHighlightData[`R-${line.oldLineNumber}`];
                  } else if (line.type === "add") {
                    syntaxTokens = fileHighlightData[`A-${line.newLineNumber}`];
                  } else if (line.type === "context") {
                    syntaxTokens = fileHighlightData[`C-${line.newLineNumber}`];
                  }
                }

                // Render expanded context lines before hunk headers
                const expandedContent = line.type === "header" ? expandedLines.get(i) : undefined;

                return (
                  <DiffLineRow
                    key={i}
                    line={line}
                    wordWrap={wordWrap}
                    canComment={canComment}
                    inlineComments={inlineComments}
                    isCommentFormOpen={isCommentFormOpen}
                    isSelected={isSelected}
                    syntaxTokens={syntaxTokens}
                    expandedContent={expandedContent}
                    expandStartLine={expandedContent ? (hunkInfos.find(h => h.index === i) ? (() => {
                      const currentHunk = hunkInfos.find(h => h.index === i)!;
                      const prevHunk = hunkInfos.filter(h => h.index < i).pop();
                      return prevHunk ? prevHunk.endNewLine + 1 : 1;
                    })() : 1) : undefined}
                    isExpandLoading={isLoadingExpand === i}
                    onExpandHunk={() => handleExpandHunk(i)}
                    onOpenComment={(shiftKey) => {
                      if (
                        lineNum !== undefined &&
                        line.type !== "header"
                      ) {
                        handleLineClick(lineNum, side, shiftKey);
                      }
                    }}
                    onStartSelect={() => {
                      if (
                        lineNum !== undefined &&
                        line.type !== "header"
                      ) {
                        handleLineMouseDown(lineNum, side);
                      }
                    }}
                    onHoverLine={() => {
                      if (lineNum !== undefined) {
                        handleLineHover(lineNum);
                      }
                    }}
                    onCloseComment={() => {
                      setCommentRange(null);
                      setSelectingFrom(null);
                      setHoverLine(null);
                    }}
                    commentStartLine={isCommentFormOpen ? commentRange!.startLine : undefined}
                    selectedLinesContent={isCommentFormOpen ? selectedLinesContent : undefined}
                    selectedCodeForAI={isCommentFormOpen ? selectedCodeForAI : undefined}
                    owner={owner}
                    repo={repo}
                    pullNumber={pullNumber}
                    headSha={headSha}
                    headBranch={headBranch}
                    filename={file.filename}
                    canWrite={canWrite}
                    onAddContext={onAddContext}
                    participants={participants}
                  />
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-16 text-center">
            <File className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground/50 font-mono">
              {file.status === "renamed"
                ? "File renamed without changes"
                : "Binary file or no diff available"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function DiffLineRow({
  line,
  wordWrap,
  canComment,
  inlineComments,
  isCommentFormOpen,
  isSelected,
  syntaxTokens,
  expandedContent,
  expandStartLine,
  isExpandLoading,
  onExpandHunk,
  onOpenComment,
  onStartSelect,
  onHoverLine,
  onCloseComment,
  commentStartLine,
  selectedLinesContent,
  selectedCodeForAI,
  owner,
  repo,
  pullNumber,
  headSha,
  headBranch,
  filename,
  canWrite = true,
  onAddContext,
  participants,
}: {
  line: DiffLine;
  wordWrap: boolean;
  canComment: boolean;
  inlineComments: ReviewComment[];
  isCommentFormOpen: boolean;
  isSelected?: boolean;
  syntaxTokens?: SyntaxToken[];
  expandedContent?: string[];
  expandStartLine?: number;
  isExpandLoading?: boolean;
  onExpandHunk?: () => void;
  onOpenComment: (shiftKey: boolean) => void;
  onStartSelect?: () => void;
  onHoverLine?: () => void;
  onCloseComment: () => void;
  commentStartLine?: number;
  selectedLinesContent?: string;
  selectedCodeForAI?: string;
  owner?: string;
  repo?: string;
  pullNumber?: number;
  headSha?: string;
  headBranch?: string;
  filename: string;
  canWrite?: boolean;
  onAddContext?: AddContextCallback;
  participants?: Array<{ login: string; avatar_url: string }>;
}) {
  if (line.type === "header") {
    const funcMatch = line.content.match(/@@ .+? @@\s*(.*)/);
    const funcName = funcMatch?.[1];
    return (
      <>
        {/* Expanded context lines above this hunk */}
        {expandedContent && expandedContent.length > 0 && expandedContent.map((text, ei) => (
          <tr key={`exp-${ei}`} className="diff-expanded-context">
            <td className="w-[3px] p-0 sticky left-0 z-[1]" />
            <td className="w-10 py-0 pr-2 text-right text-[11px] font-mono text-muted-foreground/25 select-none border-r border-zinc-200/40 dark:border-zinc-800/40 sticky left-[3px] z-[1]">
              {(expandStartLine ?? 1) + ei}
            </td>
            <td className={cn(
              "py-0 font-mono text-[12.5px] leading-[20px]",
              wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
            )}>
              <div className="flex">
                <span className="inline-block w-5 text-center shrink-0 select-none text-transparent">{" "}</span>
                <span className="pl-1 text-muted-foreground/60">{text}</span>
              </div>
            </td>
          </tr>
        ))}
        <tr className="diff-hunk-header">
          <td className="w-[3px] p-0 sticky left-0 z-[1]" />
          <td className="w-10 py-1.5 pr-2 text-right text-[11px] font-mono text-blue-400/40 select-none bg-blue-500/[0.04] dark:bg-blue-500/[0.06] border-r border-zinc-200/60 dark:border-zinc-800/60 sticky left-[3px] z-[1]">
            {onExpandHunk && !expandedContent ? (
              <button
                onClick={onExpandHunk}
                disabled={isExpandLoading}
                className="w-full flex items-center justify-center cursor-pointer hover:text-blue-400/70 transition-colors disabled:opacity-40"
                title="Expand context"
              >
                {isExpandLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UnfoldVertical className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              "..."
            )}
          </td>
          <td className="py-1.5 px-3 text-[11px] font-mono bg-blue-500/[0.04] dark:bg-blue-500/[0.06]">
            <span className="text-blue-400/60 dark:text-blue-400/50">
              {line.content.match(/@@ .+? @@/)?.[0]}
            </span>
            {funcName && (
              <span className="text-muted-foreground/50 ml-2">{funcName}</span>
            )}
          </td>
        </tr>
      </>
    );
  }

  const isAdd = line.type === "add";
  const isDel = line.type === "remove";
  const lineNum = isAdd ? line.newLineNumber : line.oldLineNumber;
  const side: "LEFT" | "RIGHT" = isDel ? "LEFT" : "RIGHT";

  return (
    <>
      <tr
        data-line={lineNum}
        onMouseEnter={onHoverLine}
        className={cn(
          "group/line hover:brightness-95 dark:hover:brightness-110 transition-[filter] duration-75",
          isAdd && "diff-add-row",
          isDel && "diff-del-row",
          isSelected && "!bg-zinc-500/[0.08] dark:!bg-zinc-400/[0.07]"
        )}
      >
        {/* Gutter bar */}
        <td
          className={cn(
            "w-[3px] p-0 sticky left-0 z-[1]",
            isSelected
              ? "bg-zinc-400 dark:bg-zinc-500"
              : isAdd
                ? "bg-emerald-500"
                : isDel
                  ? "bg-red-400"
                  : ""
          )}
        />

        {/* Line number */}
        <td
          className={cn(
            "w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-zinc-200/40 dark:border-zinc-800/40 sticky left-[3px] z-[1] relative",
            isSelected
              ? "bg-zinc-500/[0.06] dark:bg-zinc-400/[0.06] text-zinc-500/50 dark:text-zinc-400/40"
              : isAdd
                ? "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.08] text-emerald-600/40 dark:text-emerald-400/30"
                : isDel
                  ? "bg-red-500/[0.10] dark:bg-red-400/[0.10] text-red-500/40 dark:text-red-400/30"
                  : "text-muted-foreground/30"
          )}
        >
          {canComment && lineNum !== undefined && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                onStartSelect?.();
              }}
              onClick={(e) => onOpenComment(e.shiftKey)}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/line:opacity-100 transition-opacity text-foreground/50 hover:text-foreground/70 cursor-pointer"
              title="Add review comment (shift+click for range)"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          {(isAdd ? line.newLineNumber : line.oldLineNumber) ?? ""}
        </td>

        {/* Content */}
        <td
          className={cn(
            "py-0 font-mono text-[12.5px] leading-[20px]",
            wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
            isAdd && "bg-emerald-500/[0.10] dark:bg-emerald-400/[0.09]",
            isDel && "bg-red-500/[0.13] dark:bg-red-400/[0.11]"
          )}
        >
          <div className="flex">
            <span
              className={cn(
                "inline-block w-5 text-center shrink-0 select-none",
                isAdd
                  ? "text-emerald-500/50"
                  : isDel
                    ? "text-red-400/50"
                    : "text-transparent"
              )}
            >
              {isAdd ? "+" : isDel ? "-" : " "}
            </span>
            <span className="pl-1">
              {syntaxTokens ? (
                line.segments ? (
                  <SyntaxSegmentedContent segments={line.segments} tokens={syntaxTokens} type={line.type} />
                ) : (
                  <span className="diff-syntax">
                    {syntaxTokens.map((t, ti) => (
                      <span key={ti} style={{ "--shiki-light": t.lightColor, "--shiki-dark": t.darkColor } as React.CSSProperties}>
                        {t.text}
                      </span>
                    ))}
                  </span>
                )
              ) : line.segments ? (
                <SegmentedContent segments={line.segments} type={line.type} />
              ) : (
                <span
                  className={cn(
                    isAdd && "text-emerald-700 dark:text-emerald-300",
                    isDel && "text-red-600 dark:text-red-300"
                  )}
                >
                  {line.content}
                </span>
              )}
            </span>
          </div>
        </td>
      </tr>

      {/* Existing inline review comments */}
      {inlineComments.map((comment) => (
        <tr key={`rc-${comment.id}`}>
          <td colSpan={3} className="p-0">
            <InlineCommentDisplay
              comment={comment}
              owner={owner}
              repo={repo}
              pullNumber={pullNumber}
              headBranch={headBranch}
              filename={filename}
              canWrite={canWrite}
            />
          </td>
        </tr>
      ))}

      {/* Inline comment form */}
      {isCommentFormOpen && lineNum !== undefined && (
        <tr>
          <td colSpan={3} className="p-0">
            <InlineCommentForm
              owner={owner!}
              repo={repo!}
              pullNumber={pullNumber!}
              headSha={headSha!}
              headBranch={headBranch}
              filename={filename}
              line={lineNum}
              side={side}
              startLine={commentStartLine}
              selectedLinesContent={selectedLinesContent}
              selectedCodeForAI={selectedCodeForAI}
              onClose={onCloseComment}
              onAddContext={onAddContext}
              participants={participants}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function InlineCommentForm({
  owner,
  repo,
  pullNumber,
  headSha,
  headBranch,
  filename,
  line,
  side,
  startLine,
  selectedLinesContent,
  selectedCodeForAI,
  onClose,
  onAddContext,
  participants,
}: {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  headBranch?: string;
  filename: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  selectedLinesContent?: string;
  selectedCodeForAI?: string;
  onClose: () => void;
  onAddContext?: AddContextCallback;
  participants?: Array<{ login: string; avatar_url: string }>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);

  const isMultiLine = startLine !== undefined && startLine !== line;

  const handleInsertSuggestion = () => {
    const suggestion = `\`\`\`suggestion\n${selectedLinesContent || ""}\n\`\`\``;
    if (!body) {
      setBody(suggestion);
    } else {
      setBody(body + "\n" + suggestion);
    }
    setTimeout(() => editorRef.current?.focus(), 0);
  };

  const handleSubmit = () => {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addPRReviewComment(
        owner,
        repo,
        pullNumber,
        body.trim(),
        headSha,
        filename,
        line,
        side,
        startLine,
        side
      );
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="mx-3 my-1.5 max-w-xl rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
      {isMultiLine && (
        <div className="px-3 py-1 bg-zinc-500/[0.04] dark:bg-white/[0.02] border-b border-zinc-200/40 dark:border-zinc-800">
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Lines {startLine}–{line}
          </span>
        </div>
      )}

      <div className="px-2 pt-2 pb-1">
        <MarkdownEditor
          ref={editorRef}
          value={body}
          onChange={setBody}
          placeholder="Leave a comment..."
          rows={5}
          autoFocus
          compact
          participants={participants}
          className="border-0 rounded-none focus-within:border-0 focus-within:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === "Escape") {
              onClose();
            }
          }}
        />
      </div>

      {error && (
        <p className="text-[10px] text-red-500 px-3 pb-1">{error}</p>
      )}

      {/* Bottom bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-zinc-100 dark:border-zinc-800">
        {/* Suggest button */}
        {side === "RIGHT" && (
          <button
            onClick={handleInsertSuggestion}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors cursor-pointer",
              "text-muted-foreground/50 hover:text-foreground hover:bg-zinc-200/40 dark:hover:bg-zinc-700/30"
            )}
            title="Suggest a code change"
          >
            Suggest
          </button>
        )}

        {/* Ask Ghost button */}
        {onAddContext && (
          <button
            onClick={() => {
              onAddContext({
                filename,
                startLine: startLine ?? line,
                endLine: line,
                selectedCode: selectedCodeForAI || selectedLinesContent || "",
                side,
              });
            }}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors cursor-pointer",
              "text-muted-foreground/50 hover:text-foreground hover:bg-zinc-200/40 dark:hover:bg-zinc-700/30"
            )}
            title="Add code context to Ghost"
          >
            <Ghost className="w-3.5 h-3.5" />
            Add to Ghost
          </button>
        )}

        <div className="flex-1" />

        {/* Cancel */}
        <button
          onClick={onClose}
          disabled={isPending}
          className="px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-foreground rounded-md transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
          className={cn(
            "flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer",
            body.trim()
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-zinc-100 dark:bg-zinc-800/50 text-muted-foreground/40",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              Comment
              <CornerDownLeft className="w-3 h-3 opacity-50" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** Parse suggestion blocks from comment body */
function parseSuggestionBlock(body: string) {
  const match = body.match(/```suggestion\n([\s\S]*?)```/);
  if (!match) return null;
  const suggestion = match[1].replace(/\n$/, "");
  const before = body.slice(0, match.index!).trim();
  const after = body.slice(match.index! + match[0].length).trim();
  return { before, suggestion, after };
}

/** Renders an inline review comment with suggestion support */
function InlineCommentDisplay({
  comment,
  owner,
  repo,
  pullNumber,
  headBranch,
  filename,
  canWrite = true,
}: {
  comment: ReviewComment;
  owner?: string;
  repo?: string;
  pullNumber?: number;
  headBranch?: string;
  filename: string;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [commitMessage, setCommitMessage] = useState(`Apply suggestion to ${filename}`);

  const parsed = parseSuggestionBlock(comment.body);
  const canCommit = !!(owner && repo && pullNumber && headBranch && comment.line);

  const handleCommitSuggestion = (suggestion: string, message: string) => {
    if (!canCommit) return;
    const startLine = (comment as any).start_line ?? comment.line!;
    const endLine = comment.line!;
    setResult(null);
    startTransition(async () => {
      const res = await commitSuggestion(
        owner!,
        repo!,
        pullNumber!,
        filename,
        headBranch!,
        startLine,
        endLine,
        suggestion,
        message
      );
      if (res.error) {
        setResult({ type: "error", msg: res.error });
      } else {
        setResult({ type: "success", msg: "Committed" });
        router.refresh();
      }
    });
  };

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mx-3 my-1.5 border border-zinc-200/60 dark:border-zinc-800/50 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/30">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-zinc-100/40 dark:hover:bg-zinc-800/20 transition-colors rounded-t-lg"
        onClick={() => setCollapsed((c) => !c)}
      >
        <ChevronDown
          className={cn(
            "w-3 h-3 shrink-0 text-muted-foreground/40 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        {comment.user ? (
          <Link
            href={`/users/${comment.user.login}`}
            className="text-xs font-medium text-foreground/70 hover:text-foreground hover:underline transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {comment.user.login}
          </Link>
        ) : (
          <span className="text-xs font-medium text-foreground/70">ghost</span>
        )}
        <span className="text-[10px] text-muted-foreground/50">
          {timeAgo(comment.created_at)}
        </span>
        {collapsed && (
          <span className="text-[10px] text-muted-foreground/50 truncate flex-1 min-w-0">
            {comment.body.slice(0, 60)}{comment.body.length > 60 ? "..." : ""}
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {parsed ? (
            <div>
              {parsed.before && (
                <div className="px-3 py-2 text-sm text-foreground/70">
                  <ClientMarkdown content={parsed.before} />
                </div>
              )}

              <div className="border-y border-zinc-200/40 dark:border-zinc-800/30">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100/50 dark:bg-zinc-800/20">
                  <Code2 className="w-3 h-3 text-muted-foreground/50" />
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    Suggested change
                  </span>
                </div>
                <pre className="px-3 py-2 text-[12.5px] font-mono leading-[20px] bg-emerald-500/[0.04] dark:bg-emerald-400/[0.04] text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                  {parsed.suggestion}
                </pre>
                {canCommit && canWrite && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50/50 dark:bg-zinc-900/20">
                    {result && (
                      <span
                        className={cn(
                          "text-[10px] font-mono",
                          result.type === "error" ? "text-red-500" : "text-emerald-500"
                        )}
                      >
                        {result.msg}
                      </span>
                    )}
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      disabled={isPending || result?.type === "success"}
                      className={cn(
                        "flex-1 min-w-0 px-2 py-1 text-[10px] font-mono",
                        "bg-transparent border border-border rounded-md",
                        "text-foreground/70 placeholder:text-muted-foreground/40",
                        "focus:outline-none focus:ring-1 focus:ring-foreground/20",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    />
                    <button
                      onClick={() => handleCommitSuggestion(parsed.suggestion, commitMessage)}
                      disabled={isPending || result?.type === "success"}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider",
                        "border border-border",
                        "text-foreground/70 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/40",
                        "transition-colors cursor-pointer rounded-md",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    >
                      {isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : result?.type === "success" ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Commit suggestion
                    </button>
                  </div>
                )}
              </div>

              {parsed.after && (
                <div className="px-3 py-2 text-sm text-foreground/70">
                  <ClientMarkdown content={parsed.after} />
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-foreground/70">
              <ClientMarkdown content={comment.body} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SegmentedContent({
  segments,
  type,
}: {
  segments: DiffSegment[];
  type: "add" | "remove" | "context" | "header";
}) {
  return (
    <>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            type === "add" && "text-emerald-700 dark:text-emerald-300",
            type === "remove" && "text-red-600 dark:text-red-300",
            seg.highlight &&
              type === "add" &&
              "bg-emerald-500/25 dark:bg-emerald-400/20 rounded-[2px] px-[1px] -mx-[1px]",
            seg.highlight &&
              type === "remove" &&
              "bg-red-500/25 dark:bg-red-400/20 rounded-[2px] px-[1px] -mx-[1px]"
          )}
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

/** Merges syntax highlighting tokens with word-diff segments.
 *  Segments provide the background highlight (changed words), tokens provide text color. */
function SyntaxSegmentedContent({
  segments,
  tokens,
  type,
}: {
  segments: DiffSegment[];
  tokens: SyntaxToken[];
  type: "add" | "remove" | "context" | "header";
}) {
  // Flatten segments and tokens by character position to merge them.
  // Walk through both simultaneously, splitting tokens at segment boundaries.
  const result: { text: string; highlight: boolean; lightColor: string; darkColor: string }[] = [];

  let segIdx = 0;
  let segCharOffset = 0; // chars consumed in current segment
  let tokIdx = 0;
  let tokCharOffset = 0; // chars consumed in current token

  while (segIdx < segments.length && tokIdx < tokens.length) {
    const seg = segments[segIdx];
    const tok = tokens[tokIdx];
    const segRemaining = seg.text.length - segCharOffset;
    const tokRemaining = tok.text.length - tokCharOffset;
    const take = Math.min(segRemaining, tokRemaining);

    if (take > 0) {
      result.push({
        text: tok.text.slice(tokCharOffset, tokCharOffset + take),
        highlight: seg.highlight,
        lightColor: tok.lightColor,
        darkColor: tok.darkColor,
      });
    }

    segCharOffset += take;
    tokCharOffset += take;
    if (segCharOffset >= seg.text.length) { segIdx++; segCharOffset = 0; }
    if (tokCharOffset >= tok.text.length) { tokIdx++; tokCharOffset = 0; }
  }

  // Any remaining tokens (if segments ran out)
  while (tokIdx < tokens.length) {
    const tok = tokens[tokIdx];
    const text = tok.text.slice(tokCharOffset);
    if (text) {
      result.push({ text, highlight: false, lightColor: tok.lightColor, darkColor: tok.darkColor });
    }
    tokIdx++;
    tokCharOffset = 0;
  }

  return (
    <span className="diff-syntax">
      {result.map((r, i) => (
        <span
          key={i}
          className={cn(
            r.highlight &&
              type === "add" &&
              "bg-emerald-500/25 dark:bg-emerald-400/20 rounded-[2px] px-[1px] -mx-[1px]",
            r.highlight &&
              type === "remove" &&
              "bg-red-500/25 dark:bg-red-400/20 rounded-[2px] px-[1px] -mx-[1px]"
          )}
          style={{ "--shiki-light": r.lightColor, "--shiki-dark": r.darkColor } as React.CSSProperties}
        >
          {r.text}
        </span>
      ))}
    </span>
  );
}

/** Full file view: shows entire file with diff changes highlighted inline */
function FullFileView({
  fileContent,
  lines,
  hunkInfos,
  wordWrap,
  fileHighlightData,
  fullFileTokens,
}: {
  fileContent: string[];
  lines: DiffLine[];
  hunkInfos: { index: number; newStart: number; newCount: number; endNewLine: number }[];
  wordWrap: boolean;
  fileHighlightData?: Record<string, SyntaxToken[]>;
  fullFileTokens?: SyntaxToken[][] | null;
}) {
  // Build a merged view: walk through the file content line by line,
  // inserting diff add/remove lines where they belong.

  // Collect changed line info from the diff
  const addedNewLines = new Set<number>(); // new-file line numbers that are additions
  const removedByNewLine = new Map<number, DiffLine[]>(); // removed lines keyed by the new-file line they precede
  const contextHighlight = new Map<number, { tokens?: SyntaxToken[]; segments?: DiffSegment[] }>();

  // Walk hunks to map removed lines to their position in the new file
  for (let hi = 0; hi < hunkInfos.length; hi++) {
    const hunk = hunkInfos[hi];
    // Find diff lines belonging to this hunk
    const hunkDiffStart = hunk.index + 1; // skip the header
    const hunkDiffEnd = hi + 1 < hunkInfos.length ? hunkInfos[hi + 1].index : lines.length;

    let newLineTracker = hunk.newStart;
    const pendingRemoves: DiffLine[] = [];

    for (let li = hunkDiffStart; li < hunkDiffEnd; li++) {
      const dl = lines[li];
      if (dl.type === "remove") {
        pendingRemoves.push(dl);
      } else if (dl.type === "add") {
        addedNewLines.add(newLineTracker);
        // Attach pending removes to this add line
        if (pendingRemoves.length > 0) {
          const existing = removedByNewLine.get(newLineTracker) || [];
          existing.push(...pendingRemoves);
          removedByNewLine.set(newLineTracker, existing);
          pendingRemoves.length = 0;
        }
        // Store syntax tokens for add lines
        if (fileHighlightData) {
          contextHighlight.set(newLineTracker, {
            tokens: fileHighlightData[`A-${newLineTracker}`],
            segments: dl.segments,
          });
        }
        newLineTracker++;
      } else if (dl.type === "context") {
        // Flush pending removes before this context line
        if (pendingRemoves.length > 0) {
          const existing = removedByNewLine.get(newLineTracker) || [];
          existing.push(...pendingRemoves);
          removedByNewLine.set(newLineTracker, existing);
          pendingRemoves.length = 0;
        }
        // Store syntax tokens for context lines
        if (fileHighlightData) {
          contextHighlight.set(newLineTracker, {
            tokens: fileHighlightData[`C-${newLineTracker}`],
          });
        }
        newLineTracker++;
      }
    }
    // Remaining removes at end of hunk — attach to the line after the hunk
    if (pendingRemoves.length > 0) {
      const afterLine = newLineTracker;
      const existing = removedByNewLine.get(afterLine) || [];
      existing.push(...pendingRemoves);
      removedByNewLine.set(afterLine, existing);
    }
  }

  // Build merged rows
  type MergedRow =
    | { kind: "normal"; lineNum: number; content: string; isAdd: boolean; tokens?: SyntaxToken[]; segments?: DiffSegment[] }
    | { kind: "removed"; oldLineNum: number; content: string; tokens?: SyntaxToken[]; segments?: DiffSegment[] };

  const mergedRows: MergedRow[] = [];

  for (let i = 0; i < fileContent.length; i++) {
    const lineNum = i + 1;

    // Insert removed lines that precede this new-file line
    const removes = removedByNewLine.get(lineNum);
    if (removes) {
      for (const rm of removes) {
        mergedRows.push({
          kind: "removed",
          oldLineNum: rm.oldLineNumber ?? 0,
          content: rm.content,
          tokens: fileHighlightData?.[`R-${rm.oldLineNumber}`],
          segments: rm.segments,
        });
      }
    }

    const isAdd = addedNewLines.has(lineNum);
    const highlight = contextHighlight.get(lineNum);

    mergedRows.push({
      kind: "normal",
      lineNum,
      content: fileContent[i],
      isAdd,
      tokens: highlight?.tokens ?? fullFileTokens?.[i] ?? undefined,
      segments: highlight?.segments,
    });
  }

  // Handle removes that come after the last line
  const afterEnd = fileContent.length + 1;
  const trailingRemoves = removedByNewLine.get(afterEnd);
  if (trailingRemoves) {
    for (const rm of trailingRemoves) {
      mergedRows.push({
        kind: "removed",
        oldLineNum: rm.oldLineNumber ?? 0,
        content: rm.content,
        tokens: fileHighlightData?.[`R-${rm.oldLineNumber}`],
        segments: rm.segments,
      });
    }
  }

  return (
    <table className={cn("w-full border-collapse", wordWrap && "table-fixed")}>
      {wordWrap && (
        <colgroup>
          <col className="w-[3px]" />
          <col className="w-10" />
          <col />
        </colgroup>
      )}
      <tbody>
        {mergedRows.map((row, i) => {
          if (row.kind === "removed") {
            return (
              <tr key={`rm-${i}`} className="diff-del-row">
                <td className="w-[3px] p-0 sticky left-0 z-[1] bg-red-400" />
                <td className="w-10 py-0 pr-2 text-right text-[11px] font-mono text-red-500/40 dark:text-red-400/30 select-none border-r border-zinc-200/40 dark:border-zinc-800/40 sticky left-[3px] z-[1] bg-red-500/[0.10] dark:bg-red-400/[0.10]" />
                <td className={cn(
                  "py-0 font-mono text-[12.5px] leading-[20px] bg-red-500/[0.13] dark:bg-red-400/[0.11]",
                  wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                )}>
                  <div className="flex">
                    <span className="inline-block w-5 text-center shrink-0 select-none text-red-400/50">-</span>
                    <span className="pl-1">
                      {row.tokens ? (
                        row.segments ? (
                          <SyntaxSegmentedContent segments={row.segments} tokens={row.tokens} type="remove" />
                        ) : (
                          <span className="diff-syntax">
                            {row.tokens.map((t, ti) => (
                              <span key={ti} style={{ "--shiki-light": t.lightColor, "--shiki-dark": t.darkColor } as React.CSSProperties}>
                                {t.text}
                              </span>
                            ))}
                          </span>
                        )
                      ) : (
                        <span className="text-red-600 dark:text-red-300">{row.content}</span>
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            );
          }

          const isAdd = row.isAdd;
          return (
            <tr key={`ln-${i}`} className={isAdd ? "diff-add-row" : undefined}>
              <td className={cn(
                "w-[3px] p-0 sticky left-0 z-[1]",
                isAdd && "bg-emerald-500"
              )} />
              <td className={cn(
                "w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-zinc-200/40 dark:border-zinc-800/40 sticky left-[3px] z-[1]",
                isAdd
                  ? "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.08] text-emerald-600/40 dark:text-emerald-400/30"
                  : "text-muted-foreground/30"
              )}>
                {row.lineNum}
              </td>
              <td className={cn(
                "py-0 font-mono text-[12.5px] leading-[20px]",
                wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
                isAdd && "bg-emerald-500/[0.10] dark:bg-emerald-400/[0.09]"
              )}>
                <div className="flex">
                  <span className={cn(
                    "inline-block w-5 text-center shrink-0 select-none",
                    isAdd ? "text-emerald-500/50" : "text-transparent"
                  )}>
                    {isAdd ? "+" : " "}
                  </span>
                  <span className="pl-1">
                    {row.tokens ? (
                      row.segments ? (
                        <SyntaxSegmentedContent segments={row.segments} tokens={row.tokens} type={isAdd ? "add" : "context"} />
                      ) : (
                        <span className="diff-syntax">
                          {row.tokens.map((t, ti) => (
                            <span key={ti} style={{ "--shiki-light": t.lightColor, "--shiki-dark": t.darkColor } as React.CSSProperties}>
                              {t.text}
                            </span>
                          ))}
                        </span>
                      )
                    ) : (
                      <span className={isAdd ? "text-emerald-700 dark:text-emerald-300" : ""}>
                        {row.content}
                      </span>
                    )}
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SidebarCommits({
  commits,
  owner,
  repo,
}: {
  commits: PRCommit[];
  owner?: string;
  repo?: string;
}) {
  if (commits.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <GitCommitHorizontal className="w-4 h-4 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-[11px] text-muted-foreground/50 font-mono">
          No commits
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {commits.map((c) => {
        const shortSha = c.sha.slice(0, 7);
        const message = c.commit.message.split("\n")[0];
        const date = c.commit.author?.date;
        const commitUrl = owner && repo ? `/repos/${owner}/${repo}/commits/${c.sha}` : undefined;

        return (
          <div
            key={c.sha}
            className="px-3 py-1.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors"
          >
            <div className="flex items-start gap-1.5">
              {c.author && (
                <Image
                  src={c.author.avatar_url}
                  alt={c.author.login}
                  width={16}
                  height={16}
                  className="rounded-full mt-0.5 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {commitUrl ? (
                  <Link
                    href={commitUrl}
                    className="text-[11px] font-mono text-foreground/80 hover:text-foreground hover:underline line-clamp-2 break-words block"
                  >
                    {message}
                  </Link>
                ) : (
                  <span className="text-[11px] font-mono text-foreground/80 line-clamp-2 break-words block">
                    {message}
                  </span>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] font-mono text-blue-500/70">
                    {shortSha}
                  </span>
                  {c.author && (
                    <span className="text-[9px] text-muted-foreground/50 truncate">
                      {c.author.login}
                    </span>
                  )}
                  {date && (
                    <span className="text-[9px] text-muted-foreground/40 ml-auto shrink-0">
                      {timeAgo(date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SidebarReviews({
  files,
  threadsByFile,
  reviewSummaries,
  onNavigateToFile,
  owner,
  repo,
  pullNumber,
}: {
  files: DiffFile[];
  threadsByFile: Map<string, ReviewThread[]>;
  reviewSummaries: ReviewSummary[];
  onNavigateToFile: (index: number, line?: number | null) => void;
  owner?: string;
  repo?: string;
  pullNumber?: number;
}) {
  const router = useRouter();
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(threadsByFile.keys())
  );
  const [isPending, startTransition] = useTransition();

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleResolve = (threadId: string, resolve: boolean) => {
    if (!owner || !repo || !pullNumber) return;
    startTransition(async () => {
      if (resolve) {
        await resolveReviewThread(threadId, owner, repo, pullNumber);
      } else {
        await unresolveReviewThread(threadId, owner, repo, pullNumber);
      }
      router.refresh();
    });
  };

  // Files that have threads
  const filesWithThreads = files
    .map((f, i) => ({ file: f, index: i, threads: threadsByFile.get(f.filename) || [] }))
    .filter((f) => f.threads.length > 0);

  if (filesWithThreads.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <MessageSquare className="w-4 h-4 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-[11px] text-muted-foreground/50 font-mono">
          No review threads
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {/* Review summaries */}
      {reviewSummaries.length > 0 && (
        <div className="px-3 py-1.5 space-y-1">
          {reviewSummaries.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5">
              {r.user && (
                <Image
                  src={r.user.avatar_url}
                  alt={r.user.login}
                  width={14}
                  height={14}
                  className="rounded-full"
                />
              )}
              <span className="text-[10px] text-muted-foreground/70 truncate">
                {r.user?.login || "ghost"}
              </span>
              <ReviewStateBadge state={r.state} />
            </div>
          ))}
        </div>
      )}

      {/* Per-file threads */}
      {filesWithThreads.map(({ file, index, threads }) => {
        const name = file.filename.split("/").pop() || file.filename;
        const isExpanded = expandedFiles.has(file.filename);
        const unresolvedCount = threads.filter((t) => !t.isResolved).length;

        return (
          <div key={file.filename}>
            <button
              onClick={() => {
                toggleFile(file.filename);
                onNavigateToFile(index, null);
              }}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  "w-3 h-3 shrink-0 text-muted-foreground/50 transition-transform",
                  !isExpanded && "-rotate-90"
                )}
              />
              <span className="text-[11px] font-mono text-foreground/80 truncate flex-1 min-w-0">
                {name}
              </span>
              {unresolvedCount > 0 && (
                <span className="text-[9px] px-1 py-px rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                  {unresolvedCount}
                </span>
              )}
              <span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
                {threads.length}
              </span>
            </button>

            {isExpanded && (
              <div className="pl-3 pr-2 pb-1 space-y-1">
                {threads.map((thread) => {
                  const firstComment = thread.comments[0];
                  if (!firstComment) return null;

                  return (
                    <div
                      key={thread.id}
                      onClick={() => onNavigateToFile(index, thread.line)}
                      className={cn(
                        "rounded-md border text-left transition-colors cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30",
                        thread.isResolved
                          ? "border-zinc-200/30 dark:border-zinc-800/30 opacity-50"
                          : "border-zinc-200/60 dark:border-zinc-800/50"
                      )}
                    >
                      {/* Thread header */}
                      <div className="flex items-center gap-1 px-2 py-1">
                        {thread.isResolved ? (
                          <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500/60" />
                        ) : (
                          <Circle className="w-3 h-3 shrink-0 text-amber-500/60" />
                        )}
                        {firstComment.author && (
                          <span className="text-[10px] font-medium text-foreground/60 truncate">
                            {firstComment.author.login}
                          </span>
                        )}
                        {thread.line && (
                          <span className="text-[9px] font-mono text-muted-foreground/40 ml-auto shrink-0">
                            L{thread.line}
                          </span>
                        )}
                      </div>
                      {/* Comment body preview */}
                      <div className="px-2 pb-1.5">
                        <p className="text-[10px] text-muted-foreground/70 line-clamp-2 whitespace-pre-wrap break-words">
                          {firstComment.body}
                        </p>
                        {thread.comments.length > 1 && (
                          <span className="text-[9px] text-muted-foreground/50 mt-0.5 block">
                            +{thread.comments.length - 1} more
                          </span>
                        )}
                      </div>
                      {/* Resolve/unresolve toggle */}
                      {owner && repo && pullNumber && (
                        <div className="px-2 pb-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolve(thread.id, !thread.isResolved);
                            }}
                            disabled={isPending}
                            className={cn(
                              "text-[9px] font-mono transition-colors cursor-pointer disabled:opacity-40",
                              thread.isResolved
                                ? "text-muted-foreground/50 hover:text-amber-500"
                                : "text-muted-foreground/50 hover:text-emerald-500"
                            )}
                          >
                            {thread.isResolved ? "Unresolve" : "Resolve"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewStateBadge({ state }: { state: string }) {
  switch (state) {
    case "APPROVED":
      return (
        <span className="text-[9px] px-1.5 py-px rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
          Approved
        </span>
      );
    case "CHANGES_REQUESTED":
      return (
        <span className="text-[9px] px-1.5 py-px rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
          Changes
        </span>
      );
    case "COMMENTED":
      return (
        <span className="text-[9px] px-1.5 py-px rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
          Commented
        </span>
      );
    case "DISMISSED":
      return (
        <span className="text-[9px] px-1.5 py-px rounded-full bg-zinc-500/10 text-muted-foreground/60 font-medium">
          Dismissed
        </span>
      );
    default:
      return null;
  }
}

function getFileIcon(status: string) {
  switch (status) {
    case "added":
      return FilePlus2;
    case "removed":
      return FileX2;
    case "modified":
      return FileEdit;
    case "renamed":
    case "copied":
      return ArrowRight;
    default:
      return FileText;
  }
}

function getFileIconColor(status: string) {
  switch (status) {
    case "added":
      return "text-emerald-500";
    case "removed":
      return "text-red-400";
    case "modified":
      return "text-amber-500";
    case "renamed":
    case "copied":
      return "text-blue-400";
    default:
      return "text-muted-foreground/60";
  }
}
