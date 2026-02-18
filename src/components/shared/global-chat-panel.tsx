"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X, Code2, ChevronRight, Ghost, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChat } from "@/components/shared/ai-chat";
import {
  useGlobalChat,
  type InlineContext,
} from "@/components/shared/global-chat-provider";

// ─── Tab types & helpers ────────────────────────────────────────────────────

interface ChatTab {
  id: string;
  label: string;
}

interface TabState {
  tabs: ChatTab[];
  activeTabId: string;
  counter: number;
}

function generateTabId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultTabState(): TabState {
  const id = generateTabId();
  return { tabs: [{ id, label: "Thread 1" }], activeTabId: id, counter: 1 };
}

function loadTabState(key: string): TabState {
  if (typeof window === "undefined") return createDefaultTabState();
  try {
    const raw = localStorage.getItem(`ghost-tabs:${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.tabs?.length > 0 && parsed.activeTabId && typeof parsed.counter === "number") {
        return parsed;
      }
    }
  } catch {}
  return createDefaultTabState();
}

function saveTabState(key: string, state: TabState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`ghost-tabs:${key}`, JSON.stringify(state));
  } catch {}
}

// ─── Page hints ─────────────────────────────────────────────────────────────

/** Derive smart suggestions, placeholder, and description from the current pathname */
function getPageHints(pathname: string) {
  const repoMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    const slug = `${owner}/${repo}`;

    if (/\/pulls\/?$/.test(pathname)) {
      return {
        suggestions: ["Show open PRs", "Show closed PRs", `List issues for ${slug}`],
        placeholder: `Ask about ${slug} pull requests...`,
        description: `Ask about pull requests in ${slug}`,
      };
    }
    if (/\/issues\/?$/.test(pathname)) {
      return {
        suggestions: ["Show open issues", "Show closed issues", `Create an issue`],
        placeholder: `Ask about ${slug} issues...`,
        description: `Ask about issues in ${slug}`,
      };
    }
    if (/\/(tree|blob)\//.test(pathname)) {
      return {
        suggestions: [`What does this repo do?`, "Star this repo", "List issues"],
        placeholder: `Ask about ${slug}...`,
        description: `Browsing files in ${slug}`,
      };
    }

    return {
      suggestions: ["Star this repo", "List open issues", "List open PRs", "Fork this repo"],
      placeholder: `Ask about ${slug}...`,
      description: `Ask about ${slug}, star it, browse issues, and more`,
    };
  }

  if (pathname.startsWith("/prs")) {
    return {
      suggestions: ["Show my open PRs", "Search repos", "Go to notifications"],
      placeholder: "Ask about your pull requests...",
      description: "Ask about your pull requests across repos",
    };
  }

  if (pathname.startsWith("/issues")) {
    return {
      suggestions: ["Show my open issues", "Search repos", "Go to notifications"],
      placeholder: "Ask about your issues...",
      description: "Ask about your issues across repos",
    };
  }

  if (pathname.startsWith("/notifications")) {
    return {
      suggestions: ["Show unread", "Mark all as read", "Go to PRs"],
      placeholder: "Ask about notifications...",
      description: "Manage your GitHub notifications",
    };
  }

  if (pathname.startsWith("/repos")) {
    return {
      suggestions: ["Search repos", "Find trending repos", "Go to notifications"],
      placeholder: "Search or ask about repos...",
      description: "Search and discover GitHub repositories",
    };
  }

  return {
    suggestions: ["Search repos", "Show my notifications", "List my PRs"],
    placeholder: "Ask Ghost anything...",
    description: "Your AI assistant for GitHub. Search repos, manage issues, navigate, and more.",
  };
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export function GlobalChatPanel() {
  const { state, closeChat, registerContextHandler } = useGlobalChat();
  const [contexts, setContexts] = useState<InlineContext[]>([]);
  const prevContextKeyRef = useRef<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active file from URL ?file= param (set by PR diff viewer)
  const activeFile = searchParams.get("file") ?? undefined;

  // Extract mentionable files from PR context
  const mentionableFiles = useMemo(() => {
    const prCtx = state.contextBody?.prContext;
    if (!prCtx?.files) return undefined;
    return prCtx.files as { filename: string; patch: string }[];
  }, [state.contextBody]);

  // Clear inline contexts when context key changes
  useEffect(() => {
    if (state.contextKey !== prevContextKeyRef.current) {
      setContexts([]);
      prevContextKeyRef.current = state.contextKey;
    }
  }, [state.contextKey]);

  // Handle @ file mention — creates an InlineContext from a PR file
  const handleAddFileContext = useCallback((file: { filename: string; patch: string }) => {
    const lines = file.patch ? file.patch.split("\n") : [];
    const ctx: InlineContext = {
      filename: file.filename,
      startLine: 1,
      endLine: lines.length,
      selectedCode: file.patch,
      side: "RIGHT",
    };
    setContexts((prev) => {
      const exists = prev.some((c) => c.filename === ctx.filename && c.selectedCode === ctx.selectedCode);
      if (exists) return prev;
      return [...prev, ctx];
    });
  }, []);

  // Register the context handler for "Ask AI" from diff viewer
  const handleAddContext = useCallback((context: InlineContext) => {
    setContexts((prev) => {
      const exists = prev.some(
        (c) =>
          c.filename === context.filename &&
          c.startLine === context.startLine &&
          c.endLine === context.endLine &&
          c.side === context.side
      );
      if (exists) return prev;
      return [...prev, context];
    });
  }, []);

  useEffect(() => {
    registerContextHandler(handleAddContext);
  }, [registerContextHandler, handleAddContext]);

  // ── Effective context (page-specific or general) ──────────────────────
  // Ghost sessions are shared across all pages — same threads everywhere.
  // The page-specific context (PR, issue, etc.) is passed in the body
  // so the AI still gets the right tools and context for the current page.

  const hasPageContext = !!(state.contextKey && state.contextBody);

  const effectiveContextKey = "ghost";

  const effectiveContextBody = hasPageContext
    ? { ...state.contextBody!, pageContext: { pathname } }
    : { pageContext: { pathname } };

  const effectiveChatType = "general";

  const pageHints = getPageHints(pathname);

  const effectivePlaceholder = hasPageContext
    ? (contexts.length > 0 ? "Ask about this code..." : state.placeholder)
    : pageHints.placeholder;

  const effectiveEmptyTitle = hasPageContext
    ? state.emptyTitle
    : "Ghost";

  const effectiveEmptyDescription = hasPageContext
    ? state.emptyDescription
    : pageHints.description;

  const effectiveSuggestions = hasPageContext
    ? state.suggestions
    : pageHints.suggestions;

  // ── Tab state (persisted to localStorage per context) ─────────────────

  const [tabState, setTabState] = useState<TabState>(() =>
    loadTabState(effectiveContextKey)
  );

  // Reload tabs when effective context changes (e.g. navigating to a different PR)
  const prevTabContextRef = useRef(effectiveContextKey);
  if (effectiveContextKey !== prevTabContextRef.current) {
    prevTabContextRef.current = effectiveContextKey;
    setTabState(loadTabState(effectiveContextKey));
  }

  // Persist tab state to localStorage
  useEffect(() => {
    saveTabState(effectiveContextKey, tabState);
  }, [effectiveContextKey, tabState]);

  const activeTabId =
    tabState.tabs.find((t) => t.id === tabState.activeTabId)?.id ||
    tabState.tabs[0]?.id;

  // Clear inline contexts when switching tabs
  const prevActiveTabRef = useRef(activeTabId);
  useEffect(() => {
    if (activeTabId !== prevActiveTabRef.current) {
      setContexts([]);
      prevActiveTabRef.current = activeTabId;
    }
  }, [activeTabId]);

  const addTab = useCallback(() => {
    setTabState((prev) => {
      const id = generateTabId();
      const num = prev.counter + 1;
      return {
        tabs: [...prev.tabs, { id, label: `Thread ${num}` }],
        activeTabId: id,
        counter: num,
      };
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === tabId);
      const remaining = prev.tabs.filter((t) => t.id !== tabId);
      if (remaining.length === 0) return createDefaultTabState();
      let newActiveId = prev.activeTabId;
      if (prev.activeTabId === tabId) {
        const newIdx = Math.min(idx, remaining.length - 1);
        newActiveId = remaining[newIdx].id;
      }
      return { ...prev, tabs: remaining, activeTabId: newActiveId };
    });
  }, []);

  const switchTab = useCallback((tabId: string) => {
    setTabState((prev) => ({ ...prev, activeTabId: tabId }));
  }, []);

  // ── Inline context chips (input prefix) ───────────────────────────────

  const inputPrefix =
    contexts.length > 0 ? (
      <div className="flex flex-wrap gap-1 px-2.5 pt-2">
        {contexts.map((ctx, i) => (
          <span
            key={`${ctx.filename}:${ctx.startLine}-${ctx.endLine}-${i}`}
            className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/60 text-[10px] font-mono text-muted-foreground/70 max-w-[200px]"
          >
            <Code2 className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
            <span className="truncate">
              {ctx.filename.split("/").pop()}
              <span className="text-muted-foreground/40">
                :{ctx.startLine}
                {ctx.endLine !== ctx.startLine && `\u2013${ctx.endLine}`}
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                setContexts((prev) => prev.filter((_, j) => j !== i))
              }
              className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-pointer shrink-0"
            >
              <X className="w-2 h-2" />
            </button>
          </span>
        ))}
      </div>
    ) : null;

  // Merge inline contexts and active file into the context body
  const contextBody = {
    ...effectiveContextBody,
    ...(contexts.length > 0 ? { inlineContexts: contexts } : {}),
    ...(activeFile ? { activeFile } : {}),
  };

  return (
    <>
    <div
      className={cn(
        "fixed top-10 right-0 z-40 h-[calc(100dvh-2.5rem)] w-full sm:w-[380px]",
        "bg-background border-l border-border",
        "flex flex-col shadow-[-8px_0_24px_-4px_rgba(0,0,0,0.12)] dark:shadow-[-8px_0_24px_-4px_rgba(0,0,0,0.4)]",
        "transition-transform duration-300 ease-in-out",
        state.isOpen
          ? "translate-x-0"
          : "translate-x-full pointer-events-none"
      )}
    >
      {/* Side close tab */}
      <button
        type="button"
        onClick={closeChat}
        className={cn(
          "absolute -left-5 top-1/2 -translate-y-1/2 z-10",
          "flex items-center justify-center",
          "w-5 h-8 rounded-l-full",
          "bg-background border border-r-0 border-border",
          "text-muted-foreground hover:text-foreground",
          "cursor-pointer transition-all duration-200",
          !state.isOpen && "hidden"
        )}
      >
        <ChevronRight className="w-3 h-3" />
      </button>

      {/* Panel header */}
      <div className="group/header shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <Ghost className="w-3.5 h-3.5 text-foreground/50" />
        <span className="text-xs font-medium text-foreground/70 truncate">
          Ghost
        </span>
        <button
          type="button"
          onClick={closeChat}
          className="ml-auto p-0.5 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 opacity-0 group-hover/header:opacity-100 transition-all duration-150 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex items-center px-1.5">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {tabState.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={cn(
                "group flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium shrink-0 transition-all duration-150 cursor-pointer border-b-2",
                tab.id === activeTabId
                  ? "border-foreground/60 text-foreground/70"
                  : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
            >
              <span className="truncate max-w-[80px]">{tab.label}</span>
              {tabState.tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 dark:hover:bg-white/10 transition-opacity cursor-pointer"
                >
                  <X className="w-2 h-2" />
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={addTab}
          className="shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 transition-all duration-150 cursor-pointer ml-1"
          title="New tab"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Chat content — render all tabs, show only active */}
      {tabState.tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={cn(
              "flex-1 min-h-0 flex flex-col",
              !isActive && "hidden"
            )}
          >
            <AIChat
              apiEndpoint="/api/ai/ghost"
              contextBody={contextBody}
              contextKey={effectiveContextKey}
              persistKey={`${effectiveContextKey}::${tab.id}`}
              chatType={effectiveChatType}
              placeholder={effectivePlaceholder}
              emptyTitle={effectiveEmptyTitle}
              emptyDescription={effectiveEmptyDescription}
              suggestions={effectiveSuggestions}
              inputPrefix={isActive ? inputPrefix : null}
              onNewChat={() => setContexts([])}
              mentionableFiles={mentionableFiles}
              onAddFileContext={handleAddFileContext}
              attachedContexts={isActive ? contexts : []}
              onContextsConsumed={() => setContexts([])}
            />
          </div>
        );
      })}
    </div>
    </>
  );
}
