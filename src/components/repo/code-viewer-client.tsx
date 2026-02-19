"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Ghost, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { formatBytes } from "@/lib/github-utils";
import { cn } from "@/lib/utils";
import { useGlobalChat, type InlineContext } from "@/components/shared/global-chat-provider";

interface CodeViewerClientProps {
  html: string;
  content: string;
  filename: string;
  filePath?: string;
  language: string;
  lineCount: number;
  fileSize?: number;
  gutterW: number;
  className?: string;
  hideHeader?: boolean;
}

interface SearchMatch {
  lineIdx: number;
}

function clearTextHighlights(container: Element) {
  const marks = container.querySelectorAll("mark.search-text-match");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    }
  });
}

function highlightTextInLine(lineEl: Element, query: string, caseSensitive: boolean) {
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  const q = caseSensitive ? query : query.toLowerCase();

  for (const node of textNodes) {
    const text = node.textContent || "";
    const search = caseSensitive ? text : text.toLowerCase();
    let idx = search.indexOf(q);
    if (idx === -1) continue;

    const frag = document.createDocumentFragment();
    let last = 0;
    while (idx !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const mark = document.createElement("mark");
      mark.className = "search-text-match";
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      last = idx + q.length;
      idx = search.indexOf(q, last);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
}

function parseLineHash(hash: string): { start: number; end: number } | null {
  const match = hash.match(/^#L(\d+)(?:-L(\d+))?$/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function CodeViewerClient({
  html,
  content,
  filename,
  filePath,
  language,
  lineCount,
  fileSize,
  gutterW,
  className,
  hideHeader,
}: CodeViewerClientProps) {
  const { addCodeContext } = useGlobalChat();
  const codeRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<{ start: number; end: number } | null>(null);
  const lastClickedLineRef = useRef<number | null>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isHoveringRef = useRef(false);

  const displayName = filePath || filename;

  const clearToolbar = useCallback(() => {
    setToolbarPos(null);
    setSelectedRange(null);
  }, []);

  // Assign IDs to each .line element on mount
  useEffect(() => {
    if (!codeRef.current) return;
    const lines = codeRef.current.querySelectorAll(".line");
    lines.forEach((el, i) => {
      el.id = `L${i + 1}`;
    });
  }, [html]);

  // Apply highlight classes when highlightedLines changes
  useEffect(() => {
    if (!codeRef.current) return;
    const lines = codeRef.current.querySelectorAll(".line");
    lines.forEach((el, i) => {
      const lineNum = i + 1;
      if (highlightedLines && lineNum >= highlightedLines.start && lineNum <= highlightedLines.end) {
        el.classList.add("line-highlighted");
      } else {
        el.classList.remove("line-highlighted");
      }
    });
  }, [highlightedLines, html]);

  // Read hash on mount and scroll to line
  useEffect(() => {
    const range = parseLineHash(window.location.hash);
    if (range) {
      setHighlightedLines(range);
      lastClickedLineRef.current = range.start;
      requestAnimationFrame(() => {
        const targetEl = document.getElementById(`L${range.start}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  }, []);

  // Listen for hashchange
  useEffect(() => {
    const handler = () => {
      const range = parseLineHash(window.location.hash);
      setHighlightedLines(range);
      if (range) {
        lastClickedLineRef.current = range.start;
        const targetEl = document.getElementById(`L${range.start}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  // Gutter click handler for line number linking
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!codeRef.current) return;
    const lineEl = (e.target as HTMLElement).closest?.(".line") as HTMLElement | null;
    if (!lineEl) return;

    const lineRect = lineEl.getBoundingClientRect();
    const paddingLeft = parseFloat(getComputedStyle(lineEl).paddingLeft);
    if (e.clientX - lineRect.left > paddingLeft) return;

    e.preventDefault();

    const allLines = Array.from(codeRef.current.querySelectorAll(".line"));
    const lineIndex = allLines.indexOf(lineEl);
    if (lineIndex === -1) return;
    const lineNum = lineIndex + 1;

    if (e.shiftKey && lastClickedLineRef.current != null) {
      const start = Math.min(lastClickedLineRef.current, lineNum);
      const end = Math.max(lastClickedLineRef.current, lineNum);
      const hash = `#L${start}-L${end}`;
      window.history.replaceState(null, "", hash);
      setHighlightedLines({ start, end });
    } else {
      const hash = `#L${lineNum}`;
      window.history.replaceState(null, "", hash);
      setHighlightedLines({ start: lineNum, end: lineNum });
      lastClickedLineRef.current = lineNum;
    }

    window.getSelection()?.removeAllRanges();
  }, []);

  // Detect text selection on mouseup inside the code block
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      clearToolbar();
      return;
    }

    if (!codeRef.current?.contains(sel.anchorNode) || !codeRef.current?.contains(sel.focusNode)) {
      clearToolbar();
      return;
    }

    const selectedText = sel.toString();
    const allLines = Array.from(codeRef.current.querySelectorAll(".line"));

    const anchorLine = sel.anchorNode ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode as Element : sel.anchorNode.parentElement)?.closest(".line") : null;
    const focusLine = sel.focusNode ? (sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode as Element : sel.focusNode.parentElement)?.closest(".line") : null;

    if (!anchorLine || !focusLine) {
      clearToolbar();
      return;
    }

    const anchorIdx = allLines.indexOf(anchorLine);
    const focusIdx = allLines.indexOf(focusLine);
    if (anchorIdx === -1 || focusIdx === -1) {
      clearToolbar();
      return;
    }

    const startLine = Math.min(anchorIdx, focusIdx) + 1;
    const endLine = Math.max(anchorIdx, focusIdx) + 1;

    const containerRect = codeRef.current.getBoundingClientRect();
    setToolbarPos({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top + 20,
    });
    setSelectedRange({ start: startLine, end: endLine, text: selectedText });
  }, [clearToolbar]);

  // Clear toolbar when selection is lost
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        clearToolbar();
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [clearToolbar]);

  // --- Search: find matches when query changes ---
  useEffect(() => {
    if (!searchOpen || !searchQuery) {
      setMatches([]);
      setCurrentMatchIdx(-1);
      return;
    }

    const lines = content.split("\n");
    const query = matchCase ? searchQuery : searchQuery.toLowerCase();
    const found: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = matchCase ? lines[i] : lines[i].toLowerCase();
      let pos = 0;
      while (true) {
        const idx = line.indexOf(query, pos);
        if (idx === -1) break;
        found.push({ lineIdx: i });
        pos = idx + query.length;
      }
    }

    setMatches(found);
    setCurrentMatchIdx(found.length > 0 ? 0 : -1);
  }, [searchQuery, matchCase, searchOpen, content]);

  // --- Search: apply highlight classes + inline text marks ---
  useEffect(() => {
    if (!codeRef.current) return;
    const container = codeRef.current;
    const allLineEls = container.querySelectorAll(".code-content .line");

    // Clear previous
    clearTextHighlights(container);
    allLineEls.forEach((el) => {
      el.classList.remove("search-match", "search-match-active");
    });

    if (matches.length === 0 || currentMatchIdx < 0) return;

    const matchedLines = new Set(matches.map((m) => m.lineIdx));
    for (const lineIdx of matchedLines) {
      if (allLineEls[lineIdx]) {
        allLineEls[lineIdx].classList.add("search-match");
        highlightTextInLine(allLineEls[lineIdx], searchQuery, matchCase);
      }
    }

    const activeLineIdx = matches[currentMatchIdx]?.lineIdx;
    if (activeLineIdx !== undefined && allLineEls[activeLineIdx]) {
      allLineEls[activeLineIdx].classList.remove("search-match");
      allLineEls[activeLineIdx].classList.add("search-match-active");
      allLineEls[activeLineIdx].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [matches, currentMatchIdx, searchQuery, matchCase]);

  // --- Search: intercept Cmd+F when hovering ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && isHoveringRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setMatches([]);
    setCurrentMatchIdx(-1);
    if (codeRef.current) {
      clearTextHighlights(codeRef.current);
      codeRef.current.querySelectorAll(".code-content .line").forEach((el) => {
        el.classList.remove("search-match", "search-match-active");
      });
    }
  }, []);

  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const goToPrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeSearch();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      goToPrevMatch();
    } else if (e.key === "Enter") {
      e.preventDefault();
      goToNextMatch();
    }
  }, [closeSearch, goToNextMatch, goToPrevMatch]);

  // Escape: close search first, then clear toolbar/highlights
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchOpen) {
          closeSearch();
        } else {
          clearToolbar();
          setHighlightedLines(null);
          if (window.location.hash.startsWith("#L")) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [clearToolbar, closeSearch, searchOpen]);

  const handleAddToGhost = useCallback(
    (startLine: number, endLine: number, selectedText: string) => {
      const ctx: InlineContext = {
        filename: displayName,
        startLine,
        endLine,
        selectedCode: selectedText,
        side: "RIGHT",
      };
      addCodeContext(ctx);
      clearToolbar();
      window.getSelection()?.removeAllRanges();
    },
    [displayName, addCodeContext, clearToolbar]
  );

  const handleAddFileToGhost = useCallback(() => {
    const ctx: InlineContext = {
      filename: displayName,
      startLine: 1,
      endLine: lineCount,
      selectedCode: content,
      side: "RIGHT",
    };
    addCodeContext(ctx);
  }, [displayName, lineCount, content, addCodeContext]);

  return (
    <div>
      {/* Code block wrapper */}
      <div
        className="relative"
        onMouseEnter={() => { isHoveringRef.current = true; }}
        onMouseLeave={() => { isHoveringRef.current = false; }}
      >
        {/* Sticky header — file info + search bar together */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
          {!hideHeader && (
            <div className="flex items-center gap-3 px-1 py-1.5">
              {fileSize != null && (
                <span className="text-[11px] font-mono text-muted-foreground/60">
                  {formatBytes(fileSize)}
                </span>
              )}
              <span className="text-[11px] font-mono text-muted-foreground/60">
                {lineCount} lines
              </span>
              <span className="text-[11px] font-mono text-muted-foreground/60">
                {language}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleAddFileToGhost}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/60"
                title="Add entire file to Ghost"
              >
                <Ghost className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {searchOpen && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-md border border-b-0 border-border shadow-sm bg-background/95">
              <Search className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find in file..."
                className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
                autoFocus
              />
              {searchQuery && (
                <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
                  {matches.length > 0
                    ? `${currentMatchIdx + 1} of ${matches.length}`
                    : "No results"}
                </span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={goToPrevMatch}
                  disabled={matches.length === 0}
                  className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={goToNextMatch}
                  disabled={matches.length === 0}
                  className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                  title="Next match (Enter)"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setMatchCase(!matchCase)}
                  className={cn(
                    "px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer",
                    matchCase
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground/40 hover:text-foreground"
                  )}
                  title="Match case"
                >
                  Aa
                </button>
                <button
                  onClick={closeSearch}
                  className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                  title="Close (Escape)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          ref={codeRef}
          className={cn(
            "code-viewer overflow-x-auto border border-border relative",
            searchOpen ? "rounded-b-md" : "rounded-md",
            className
          )}
          style={{ "--cv-gutter-w": `${gutterW + 1}ch` } as React.CSSProperties}
          onClick={handleClick}
          onMouseUp={handleMouseUp}
        >
          <div
            className="code-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Floating toolbar — only when text is selected */}
          {selectedRange && toolbarPos && (
            <button
              className="absolute z-20 flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background shadow-md text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              style={{ top: toolbarPos.y, left: toolbarPos.x }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddToGhost(selectedRange.start, selectedRange.end, selectedRange.text);
              }}
            >
              <Ghost className="w-2.5 h-2.5" />
              Ghost
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
