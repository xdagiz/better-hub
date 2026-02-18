"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowUp, Square, RotateCcw, Loader2, Check, FileEdit, FilePlus2, FileSearch, GitPullRequest, Search, Star, GitFork, Eye, EyeOff, CirclePlus, CircleX, List, GitMerge, User, UserPlus, UserMinus, Bell, BellOff, Code2, Navigation, ExternalLink, MessageSquare, Tag, GitBranch, Globe, Container, Terminal, FileUp, FileDown, GitCommitHorizontal, Power, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { toInternalUrl, parseGitHubUrl } from "@/lib/github-utils";
import { AgentIcon } from "@/components/ui/agent-icon";
import { useSession } from "@/lib/auth-client";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";

/** Custom markdown components for Ghost AI responses.
 *  Rewrites github.com links to internal app routes. */
const ghostMarkdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    if (href && parseGitHubUrl(href)) {
      const internalPath = toInternalUrl(href);
      return <Link href={internalPath} {...props}>{children}</Link>;
    }
    // Check if href is already an internal app path
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (href && appUrl && href.startsWith(appUrl)) {
      const path = href.slice(appUrl.replace(/\/$/, "").length);
      return <Link href={path} {...props}>{children}</Link>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
};

interface MentionableFile {
  filename: string;
  patch: string;
}

interface AttachedContext {
  filename: string;
  startLine: number;
  endLine: number;
}

interface AIChatProps {
  apiEndpoint: string;
  contextBody: Record<string, any>;
  contextKey: string;
  /** When provided, messages are persisted to the DB via /api/ai/chat-history */
  persistKey?: string;
  /** Chat type for persistence (e.g. "pr", "issue") */
  chatType?: string;
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  suggestions?: string[];
  /** Extra content rendered above the textarea inside the input border (e.g. inline context chips) */
  inputPrefix?: React.ReactNode;
  /** Called when a new chat is started (to clear external state like inline contexts) */
  onNewChat?: () => void;
  /** List of files available for @ mention autocomplete (e.g. PR diff files) */
  mentionableFiles?: MentionableFile[];
  /** Callback when a file is selected from @ mention dropdown */
  onAddFileContext?: (file: MentionableFile) => void;
  /** Current attached contexts (for snapshotting on send) */
  attachedContexts?: AttachedContext[];
  /** Called after a message is sent to clear attached contexts */
  onContextsConsumed?: () => void;
}

export function AIChat({
  apiEndpoint,
  contextBody,
  contextKey,
  persistKey,
  chatType,
  placeholder = "Ask a question...",
  emptyTitle = "AI Assistant",
  emptyDescription = "Ask questions and get help",
  suggestions = [],
  inputPrefix,
  onNewChat,
  mentionableFiles,
  onAddFileContext,
  attachedContexts,
  onContextsConsumed,
}: AIChatProps) {
  const { data: session } = useSession();
  const globalChat = useGlobalChatOptional();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputMinHeight, setInputMinHeight] = useState(38);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(!persistKey);
  const initialMessageCountRef = useRef(0);
  // Context snapshots per user message (messageId → contexts at send time)
  const [messageContexts, setMessageContexts] = useState<Record<string, AttachedContext[]>>({});
  const pendingContextsRef = useRef<AttachedContext[] | null>(null);

  // @ mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionContainerRef = useRef<HTMLDivElement>(null);

  const filteredMentionFiles = useMemo(() => {
    if (mentionQuery === null || !mentionableFiles?.length) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableFiles.filter((f) =>
      f.filename.toLowerCase().includes(q)
    );
  }, [mentionQuery, mentionableFiles]);

  const showMentionDropdown = mentionQuery !== null && filteredMentionFiles.length > 0;

  // Detect @ trigger in input
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (!mentionableFiles?.length) {
      setMentionQuery(null);
      return;
    }
    // Find the last @ that isn't preceded by a word character
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|[^a-zA-Z0-9])@([^\s]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[2]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, [mentionableFiles]);

  const selectMentionFile = useCallback((file: MentionableFile) => {
    // Remove the @query from input
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(^|[^a-zA-Z0-9])@([^\s]*)$/);
    if (atMatch && atMatch.index !== undefined) {
      // atMatch[1] is the char before @, so the @ starts at index + length of that prefix
      const startIdx = atMatch.index + atMatch[1].length;
      const newInput = input.slice(0, startIdx) + input.slice(cursorPos);
      setInput(newInput);
    }
    setMentionQuery(null);
    onAddFileContext?.(file);
    inputRef.current?.focus();
  }, [input, onAddFileContext]);

  // Close mention dropdown on click outside
  useEffect(() => {
    if (!showMentionDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionContainerRef.current && !mentionContainerRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMentionDropdown]);

  // Use a ref so the transport body function always returns the latest contextBody.
  // This avoids stale closure issues where the transport might send an outdated body
  // (e.g. missing inlineContexts that were just added).
  const contextBodyRef = useRef(contextBody);
  contextBodyRef.current = contextBody;

  // Recreate transport when the API endpoint changes or when switching between
  // major context modes (PR → general, etc.) to reset the useChat hook's state.
  const bodyKey = useMemo(() => JSON.stringify(contextBody), [contextBody]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiEndpoint,
        body: () => contextBodyRef.current,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiEndpoint, bodyKey]
  );

  const { messages, sendMessage, setMessages, status, stop } = useChat({
    transport,
  });

  // Load chat history on mount / context change (including tab switches)
  useEffect(() => {
    if (!persistKey) {
      setHistoryLoaded(true);
      return;
    }

    let cancelled = false;
    setHistoryLoaded(false);
    // Clear immediately so stale messages from a previous tab don't flash
    setMessages([]);
    setConversationId(null);
    setMessageContexts({});
    pendingContextsRef.current = null;
    initialMessageCountRef.current = 0;
    lastSavedCountRef.current = 0;

    fetch(`/api/ai/chat-history?contextKey=${encodeURIComponent(persistKey)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.conversation && data.messages && data.messages.length > 0) {
          setConversationId(data.conversation.id);
          const uiMessages: UIMessage[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            parts: [{ type: "text" as const, text: m.content }],
          }));
          setMessages(uiMessages);
          initialMessageCountRef.current = uiMessages.length;
          lastSavedCountRef.current = uiMessages.length;
        } else {
          setConversationId(null);
          initialMessageCountRef.current = 0;
          lastSavedCountRef.current = 0;
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHistoryLoaded(true);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Persist messages as they arrive
  const lastSavedCountRef = useRef(0);
  useEffect(() => {
    if (!persistKey || !chatType || !historyLoaded) return;
    if (messages.length === 0) return;
    const newMessages = messages.slice(lastSavedCountRef.current);
    if (newMessages.length === 0) return;
    if (status === "streaming" || status === "submitted") return;

    for (const msg of newMessages) {
      const text = msg.parts
        ?.filter((p) => p.type === "text")
        .map((p) => (p as any).text)
        .join("") || "";
      if (!text) continue;

      fetch("/api/ai/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextKey: persistKey,
          chatType,
          message: { id: msg.id, role: msg.role, content: text },
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.conversation) {
            setConversationId(data.conversation.id);
          }
        })
        .catch(() => {});
    }
    lastSavedCountRef.current = messages.length;
  }, [messages, status, persistKey, chatType, historyLoaded]);

  // Track whether user has scrolled away from the bottom
  const isUserScrolledUp = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isUserScrolledUp.current = distanceFromBottom > 40;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (scrollRef.current && !isUserScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = status === "streaming";
  const isLoading = status === "submitted" || isStreaming;
  const router = useRouter();

  // Report working status to global context
  useEffect(() => {
    globalChat?.setIsWorking(isLoading);
    return () => globalChat?.setIsWorking(false);
  }, [isLoading, globalChat]);

  // ─── Client-Side Action Executor ──────────────────────────────────
  const executedActionsRef = useRef<Set<string>>(new Set());

  // Tools that mutate state — a successful call should refresh server data
  const MUTATION_TOOLS = new Set([
    "starRepo", "unstarRepo", "forkRepo", "watchRepo", "unwatchRepo",
    "createIssue", "closeIssue", "mergePullRequest",
    "followUser", "unfollowUser",
    "markNotificationsRead", "createGist",
    "commentOnIssue", "commentOnPR",
    "addLabels", "removeLabels",
    "requestReviewers", "createBranch",
    "assignIssue", "unassignIssue",
    "editFile", "createFile", "amendCommit", "createPullRequest",
    "sandboxCommitAndPush", "sandboxCreatePR",
  ]);

  useEffect(() => {
    if (!messages.length) {
      executedActionsRef.current.clear();
      return;
    }

    let needsRefresh = false;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!part.type.startsWith("tool-")) continue;
        const toolPart = part as {
          type: string;
          output?: unknown;
          toolCallId?: string;
          state?: string;
        };
        if (toolPart.state !== "output-available") continue;

        const actionKey = `${msg.id}-${toolPart.toolCallId || part.type}`;
        if (executedActionsRef.current.has(actionKey)) continue;

        const output = toolPart.output as Record<string, unknown> | undefined;
        if (!output) continue;

        const toolName = part.type.replace("tool-", "");

        // Client-side navigation actions
        if (output._clientAction) {
          executedActionsRef.current.add(actionKey);
          const action = output._clientAction as string;
          // Also refresh if this is a mutation tool with navigation
          if (MUTATION_TOOLS.has(toolName) && output.success) {
            needsRefresh = true;
          }

          setTimeout(() => {
            if (action === "refreshPage") {
              router.refresh();
              return;
            }
            if (action === "navigate") {
              const pageMap: Record<string, string> = {
                dashboard: "/dashboard",
                repos: "/repos",
                prs: "/prs",
                issues: "/issues",
                notifications: "/notifications",
                settings: "/settings",
                search: "/search",
                trending: "/trending",
                collections: "/collections",
                orgs: "/orgs",
              };
              const page = output.page as string;
              router.push(pageMap[page] ?? "/dashboard");
            } else if (action === "openRepo") {
              router.push(`/repos/${output.owner}/${output.repo}`);
            } else if (action === "openRepoTab") {
              router.push(`/repos/${output.owner}/${output.repo}/${output.tab}`);
            } else if (action === "openWorkflowRun") {
              router.push(`/repos/${output.owner}/${output.repo}/actions/${output.runId}`);
            } else if (action === "openCommit") {
              router.push(`/repos/${output.owner}/${output.repo}/commits/${output.sha}`);
            } else if (action === "openIssue") {
              router.push(`/repos/${output.owner}/${output.repo}/issues/${output.issueNumber}`);
            } else if (action === "openPullRequest") {
              router.push(`/repos/${output.owner}/${output.repo}/pulls/${output.pullNumber}`);
            } else if (action === "openUser") {
              router.push(`/users/${output.username}`);
            } else if (action === "openUrl") {
              const url = output.url as string;
              if (url) window.open(url, "_blank");
            }
          }, 600);
          continue;
        }

        // Refresh page after successful mutations
        if (MUTATION_TOOLS.has(toolName) && output.success) {
          executedActionsRef.current.add(actionKey);
          needsRefresh = true;
        }
      }
    }

    if (needsRefresh) {
      setTimeout(() => router.refresh(), 800);
    }
  }, [messages, router]);

  const handleSend = (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;
    // Re-enable auto-scroll when user sends a message
    isUserScrolledUp.current = false;
    // Snapshot attached contexts before sending
    if (attachedContexts && attachedContexts.length > 0) {
      pendingContextsRef.current = attachedContexts.map((c) => ({
        filename: c.filename,
        startLine: c.startLine,
        endLine: c.endLine,
      }));
    }
    sendMessage({ text: msg });
    setInput("");
    // Clear contexts after sending
    onContextsConsumed?.();
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  // Associate pending context snapshot with the newly created user message
  useEffect(() => {
    if (!pendingContextsRef.current) return;
    const pending = pendingContextsRef.current;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user") {
        setMessageContexts((prev) => {
          if (prev[m.id]) return prev; // already associated
          return { ...prev, [m.id]: pending };
        });
        pendingContextsRef.current = null;
        break;
      }
    }
  }, [messages]);

  // Auto-resize textarea when input changes
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const autoHeight = el.scrollHeight;
    el.style.height = Math.max(inputMinHeight, Math.min(autoHeight, 400)) + "px";
  }, [input, inputMinHeight]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle @ mention keyboard navigation
    if (showMentionDropdown) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentionFiles.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMentionFile(filteredMentionFiles[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: inputMinHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setInputMinHeight(Math.max(38, Math.min(400, dragRef.current.startHeight + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  }, [inputMinHeight]);

  const getMessageText = (message: (typeof messages)[number]) =>
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") || "";

  // Track scroll position for fade shadows
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateScrollState = () => {
      setCanScrollUp(el.scrollTop > 8);
      setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    };
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="relative flex-1 min-h-0">
        {/* Top fade shadow */}
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-b from-background to-transparent",
            canScrollUp ? "opacity-100" : "opacity-0"
          )}
        />
        {/* Bottom fade shadow */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
            "bg-gradient-to-t from-background to-transparent",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <AgentIcon className="size-6 text-muted-foreground/40" />
            <div>
              <p className="text-xs font-medium text-foreground/70 mb-0.5">
                {emptyTitle}
              </p>
              <p className="text-[11px] text-muted-foreground/50 max-w-[220px]">
                {emptyDescription}
              </p>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 max-w-[300px]">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-border/40 dark:border-white/6 bg-muted/20 dark:bg-white/[0.02] text-muted-foreground/60 hover:text-foreground hover:border-foreground/15 hover:bg-muted/40 dark:hover:bg-white/4 transition-all duration-150 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="mb-1">
                    <div className="flex items-center gap-2 mb-1">
                      {session?.user?.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || ""}
                          className="size-5 rounded-full shrink-0"
                        />
                      ) : (
                        <div className="size-5 rounded-full bg-foreground/10 shrink-0" />
                      )}
                      <span className="text-[12px] font-semibold text-foreground/80">
                        {session?.user?.name || "You"}
                      </span>
                      {/* Context chips — right side of name row */}
                      {messageContexts[message.id] && messageContexts[message.id].length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-auto">
                          {messageContexts[message.id].map((ctx, ci) => (
                            <span
                              key={`${ctx.filename}-${ci}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/60 text-[10px] font-mono text-muted-foreground/60"
                            >
                              <Code2 className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {ctx.filename.split("/").pop()}
                                <span className="text-muted-foreground/50">
                                  :{ctx.startLine}
                                  {ctx.endLine !== ctx.startLine && `\u2013${ctx.endLine}`}
                                </span>
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-[13px] text-foreground/70 whitespace-pre-wrap break-words">
                      {getMessageText(message)}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {message.parts?.map((part, i) => {
                      if (part.type === "text" && part.text) {
                        return (
                          <div key={i} className="ghmd ghmd-ai">
                            <ReactMarkdown components={ghostMarkdownComponents}>{part.text}</ReactMarkdown>
                          </div>
                        );
                      }
                      if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                        const p = part as any;
                        const toolName = part.type === "dynamic-tool" ? p.toolName : part.type.replace("tool-", "");
                        return (
                          <ToolInvocationDisplay
                            key={i}
                            toolName={toolName}
                            state={p.state}
                            args={p.input}
                            result={p.output}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Processing indicator — visible during submitted + early streaming */}
            {isLoading && (
              <div className="flex items-center gap-2 py-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
                <span className="text-[11px] font-mono text-muted-foreground/50">
                  {status === "submitted" ? "Thinking..." : "Processing..."}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        {/* New chat button */}
        {messages.length > 0 && !isLoading && (
          <div className="flex justify-end mb-1.5">
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                lastSavedCountRef.current = 0;
                setMessageContexts({});
                onNewChat?.();
                if (persistKey && conversationId) {
                  fetch(`/api/ai/chat-history?conversationId=${encodeURIComponent(conversationId)}`, {
                    method: "DELETE",
                  }).catch(() => {});
                  setConversationId(null);
                }
              }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              New chat
            </button>
          </div>
        )}
        <div className="relative">
          {/* Drag handle to resize input */}
          <div
            onMouseDown={handleDragStart}
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-8 h-3 cursor-row-resize group/drag"
          >
            <div className="w-5 h-[3px] rounded-full bg-border/60 dark:bg-white/8 group-hover/drag:bg-foreground/20 transition-colors" />
          </div>
        <div
          className={cn(
            "rounded-xl border transition-all duration-200",
            "border-border/60 dark:border-white/8",
            "bg-zinc-50/50 dark:bg-white/[0.02]",
            "focus-within:border-foreground/15 dark:focus-within:border-white/12",
            "focus-within:bg-background dark:focus-within:bg-white/[0.03]",
            "focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
          )}
        >
          {/* @ mention dropdown */}
          {showMentionDropdown && (
            <div
              ref={mentionContainerRef}
              className="border-b border-border/40 max-h-[200px] overflow-y-auto"
            >
              {filteredMentionFiles.map((file, i) => {
                const basename = file.filename.split("/").pop() || file.filename;
                const dir = file.filename.includes("/")
                  ? file.filename.slice(0, file.filename.lastIndexOf("/"))
                  : "";
                return (
                  <button
                    key={file.filename}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMentionFile(file);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
                      i === mentionIndex
                        ? "bg-zinc-100 dark:bg-zinc-800/60"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    )}
                  >
                    <Code2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <span className="text-[12px] font-mono truncate">
                      <span className="text-foreground/80">{basename}</span>
                      {dir && (
                        <span className="text-muted-foreground/40 ml-1">{dir}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {inputPrefix}
          <div className="flex items-end">
            <textarea
              ref={inputRef}
              data-ghost-input
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              className={cn(
                "flex-1 resize-none text-[13px] bg-transparent pl-3.5 pr-1.5 py-2.5",
                "placeholder:text-muted-foreground/35",
                "focus:outline-none",
                "min-h-[38px] overflow-y-auto"
              )}
            />
            <div className="shrink-0 pb-1.5 pr-1.5">
              {isLoading ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all duration-150 cursor-pointer"
                  title="Stop generating"
                >
                  <Square className="size-2.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150",
                    input.trim()
                      ? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                      : "bg-muted/50 dark:bg-white/5 text-muted-foreground/25 cursor-default"
                  )}
                  title="Send (Enter)"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
        <p className="text-[10px] text-muted-foreground/25 mt-1.5 text-center">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

export function ToolInvocationDisplay({
  toolName,
  state,
  args,
  result,
}: {
  toolName: string;
  state: string;
  args: any;
  result?: any;
}) {
  const isLoading = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const hasError = isDone && result?.error;
  const hasSuccess = isDone && result?.success;

  const config: Record<string, { icon: typeof FileEdit; loadingText: string; doneText: string }> = {
    // PR/Issue tools
    getFileContent: {
      icon: FileSearch,
      loadingText: `Reading ${args?.path || "file"}...`,
      doneText: `Read ${result?.path || args?.path || "file"}`,
    },
    editFile: {
      icon: FileEdit,
      loadingText: `Editing ${args?.path || "file"}...`,
      doneText: hasError
        ? `Failed to edit ${args?.path || "file"}`
        : `Committed to ${result?.branch || "branch"}: ${result?.commitMessage || args?.commitMessage || ""}`,
    },
    createFile: {
      icon: FilePlus2,
      loadingText: `Creating ${args?.path || "file"}...`,
      doneText: hasError
        ? `Failed to create ${args?.path || "file"}`
        : `Created ${result?.path || args?.path || "file"} on ${result?.branch || "branch"}`,
    },
    amendCommit: {
      icon: FileEdit,
      loadingText: "Amending last commit...",
      doneText: hasError
        ? "Failed to amend commit"
        : `Amended ${result?.amendedSha || ""} → ${result?.newSha || ""}: ${result?.commitMessage || ""}`,
    },
    createPullRequest: {
      icon: GitPullRequest,
      loadingText: "Creating pull request...",
      doneText: hasError
        ? "Failed to create pull request"
        : `Created PR #${result?.number || ""}: ${result?.title || args?.title || ""}`,
    },
    // General tools
    searchRepos: {
      icon: Search,
      loadingText: `Searching repos for "${args?.query || "..."}"`,
      doneText: `Found ${result?.total_count ?? 0} repos`,
    },
    searchUsers: {
      icon: Search,
      loadingText: `Searching users for "${args?.query || "..."}"`,
      doneText: `Found ${result?.total_count ?? 0} users`,
    },
    getRepoInfo: {
      icon: FileSearch,
      loadingText: `Getting info for ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: `Loaded ${result?.full_name || `${args?.owner}/${args?.repo}`}`,
    },
    starRepo: {
      icon: Star,
      loadingText: `Starring ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError ? "Failed to star" : `Starred ${result?.repo || `${args?.owner}/${args?.repo}`}`,
    },
    unstarRepo: {
      icon: Star,
      loadingText: `Unstarring ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError ? "Failed to unstar" : `Unstarred ${result?.repo || `${args?.owner}/${args?.repo}`}`,
    },
    forkRepo: {
      icon: GitFork,
      loadingText: `Forking ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError ? "Failed to fork" : `Forked to ${result?.full_name || ""}`,
    },
    watchRepo: {
      icon: Eye,
      loadingText: `Watching ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError ? "Failed to watch" : `Watching ${result?.repo || `${args?.owner}/${args?.repo}`}`,
    },
    unwatchRepo: {
      icon: EyeOff,
      loadingText: `Unwatching ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError ? "Failed to unwatch" : `Unwatched ${result?.repo || `${args?.owner}/${args?.repo}`}`,
    },
    createIssue: {
      icon: CirclePlus,
      loadingText: "Creating issue...",
      doneText: hasError ? "Failed to create issue" : `Created issue #${result?.number || ""}`,
    },
    closeIssue: {
      icon: CircleX,
      loadingText: `Closing issue #${args?.issueNumber || ""}...`,
      doneText: hasError ? "Failed to close issue" : `Closed issue #${result?.number || args?.issueNumber || ""}`,
    },
    listIssues: {
      icon: List,
      loadingText: `Listing issues for ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: `Found ${result?.issues?.length ?? 0} issues`,
    },
    listPullRequests: {
      icon: GitPullRequest,
      loadingText: `Listing PRs for ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: `Found ${result?.pull_requests?.length ?? 0} PRs`,
    },
    mergePullRequest: {
      icon: GitMerge,
      loadingText: `Merging PR #${args?.pullNumber || ""}...`,
      doneText: hasError ? "Failed to merge" : `Merged PR #${args?.pullNumber || ""}`,
    },
    getUserProfile: {
      icon: User,
      loadingText: `Loading profile for ${args?.username || ""}...`,
      doneText: `Loaded ${result?.login || args?.username || "user"}`,
    },
    followUser: {
      icon: UserPlus,
      loadingText: `Following ${args?.username || ""}...`,
      doneText: hasError ? "Failed to follow" : `Followed ${result?.username || args?.username || ""}`,
    },
    unfollowUser: {
      icon: UserMinus,
      loadingText: `Unfollowing ${args?.username || ""}...`,
      doneText: hasError ? "Failed to unfollow" : `Unfollowed ${result?.username || args?.username || ""}`,
    },
    listNotifications: {
      icon: Bell,
      loadingText: "Loading notifications...",
      doneText: `Found ${result?.notifications?.length ?? 0} notifications`,
    },
    markNotificationsRead: {
      icon: BellOff,
      loadingText: "Marking notifications as read...",
      doneText: "Marked all as read",
    },
    createGist: {
      icon: Code2,
      loadingText: `Creating gist ${args?.filename || ""}...`,
      doneText: hasError ? "Failed to create gist" : "Created gist",
    },
    refreshPage: {
      icon: RotateCcw,
      loadingText: "Refreshing page...",
      doneText: "Page refreshed",
    },
    navigateTo: {
      icon: Navigation,
      loadingText: `Navigating to ${args?.page || ""}...`,
      doneText: `Navigate to ${args?.page || "page"}`,
    },
    openRepo: {
      icon: Navigation,
      loadingText: `Opening ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: `Open ${args?.owner || ""}/${args?.repo || ""}`,
    },
    openRepoTab: {
      icon: Navigation,
      loadingText: `Opening ${args?.tab || "page"} for ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: `Open ${args?.owner || ""}/${args?.repo || ""} → ${args?.tab || "page"}`,
    },
    openWorkflowRun: {
      icon: Play,
      loadingText: `Opening workflow run #${args?.runId || ""}...`,
      doneText: `Open run #${args?.runId || ""} in ${args?.owner || ""}/${args?.repo || ""}`,
    },
    openCommit: {
      icon: GitCommitHorizontal,
      loadingText: `Opening commit ${(args?.sha || "").slice(0, 7)}...`,
      doneText: `Open commit ${(args?.sha || "").slice(0, 7)} in ${args?.owner || ""}/${args?.repo || ""}`,
    },
    openIssue: {
      icon: Navigation,
      loadingText: `Opening issue #${args?.issueNumber || ""}...`,
      doneText: `Open ${args?.owner || ""}/${args?.repo || ""}#${args?.issueNumber || ""}`,
    },
    openPullRequest: {
      icon: Navigation,
      loadingText: `Opening PR #${args?.pullNumber || ""}...`,
      doneText: `Open ${args?.owner || ""}/${args?.repo || ""}#${args?.pullNumber || ""}`,
    },
    openUser: {
      icon: Navigation,
      loadingText: `Opening profile ${args?.username || ""}...`,
      doneText: `Open ${args?.username || "user"}'s profile`,
    },
    openUrl: {
      icon: ExternalLink,
      loadingText: "Opening link...",
      doneText: args?.description || "Opened link",
    },
    // Flexible API
    queryGitHub: {
      icon: Globe,
      loadingText: `Querying GitHub API...`,
      doneText: hasError ? "API query failed" : "Queried GitHub API",
    },
    // Comment tools
    commentOnIssue: {
      icon: MessageSquare,
      loadingText: `Commenting on issue #${args?.issueNumber || ""}...`,
      doneText: hasError ? "Failed to comment" : "Commented on issue",
    },
    commentOnPR: {
      icon: MessageSquare,
      loadingText: `Commenting on PR #${args?.pullNumber || ""}...`,
      doneText: hasError ? "Failed to comment" : "Commented on PR",
    },
    // Label tools
    addLabels: {
      icon: Tag,
      loadingText: "Adding labels...",
      doneText: hasError ? "Failed to add labels" : `Added labels: ${result?.labels?.join(", ") || ""}`,
    },
    removeLabels: {
      icon: Tag,
      loadingText: `Removing label "${args?.label || ""}"...`,
      doneText: hasError ? "Failed to remove label" : `Removed ${result?.removed || args?.label || "label"}`,
    },
    // Review tools
    requestReviewers: {
      icon: UserPlus,
      loadingText: "Requesting reviewers...",
      doneText: hasError ? "Failed to request reviewers" : `Requested review from ${result?.requested_reviewers?.join(", ") || ""}`,
    },
    // Branch tools
    createBranch: {
      icon: GitBranch,
      loadingText: `Creating branch ${args?.branchName || ""}...`,
      doneText: hasError ? "Failed to create branch" : `Created branch ${result?.branch || args?.branchName || ""}`,
    },
    // Assign tools
    assignIssue: {
      icon: UserPlus,
      loadingText: "Assigning users...",
      doneText: hasError ? "Failed to assign" : `Assigned: ${result?.assignees?.join(", ") || ""}`,
    },
    unassignIssue: {
      icon: UserMinus,
      loadingText: "Unassigning users...",
      doneText: hasError ? "Failed to unassign" : "Unassigned users",
    },
    // Sandbox tools
    startSandbox: {
      icon: Container,
      loadingText: `Starting sandbox for ${args?.owner || ""}/${args?.repo || ""}...`,
      doneText: hasError
        ? `Sandbox failed: ${result?.error || "unknown error"}`
        : `Sandbox ready — ${result?.packageManager || "npm"}${result?.isMonorepo ? " monorepo" : ""} • ${result?.branch || ""}`,
    },
    sandboxRun: {
      icon: Terminal,
      loadingText: `Running: ${(args?.command || "").slice(0, 60)}${(args?.command || "").length > 60 ? "..." : ""}`,
      doneText: hasError
        ? `Command failed: ${result?.error || ""}`
        : `Ran command (exit ${result?.exitCode ?? "?"})`,
    },
    sandboxReadFile: {
      icon: FileDown,
      loadingText: `Reading ${args?.path || "file"}...`,
      doneText: hasError ? `Failed to read ${args?.path || "file"}` : `Read ${args?.path || "file"}`,
    },
    sandboxWriteFile: {
      icon: FileUp,
      loadingText: `Writing ${args?.path || "file"}...`,
      doneText: hasError ? `Failed to write ${args?.path || "file"}` : `Wrote ${args?.path || "file"}`,
    },
    sandboxCommitAndPush: {
      icon: GitCommitHorizontal,
      loadingText: `Committing and pushing to ${args?.branch || "branch"}...`,
      doneText: hasError
        ? `Push failed: ${result?.error || ""}`
        : `Pushed to ${result?.branch || args?.branch || "branch"}`,
    },
    sandboxCreatePR: {
      icon: GitPullRequest,
      loadingText: "Creating pull request...",
      doneText: hasError
        ? "Failed to create PR"
        : `Created PR #${result?.number || ""}: ${result?.title || args?.title || ""}`,
    },
    killSandbox: {
      icon: Power,
      loadingText: "Shutting down sandbox...",
      doneText: "Sandbox terminated",
    },
  };

  const c = config[toolName] || {
    icon: FileSearch,
    loadingText: `Running ${toolName}...`,
    doneText: `Completed ${toolName}`,
  };

  const Icon = c.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono",
        hasError
          ? "bg-red-500/[0.06] text-red-500/80"
          : hasSuccess
            ? "bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
            : "bg-zinc-100 dark:bg-zinc-800/40 text-muted-foreground/70"
      )}
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
      ) : hasError ? (
        <Icon className="w-3 h-3 shrink-0" />
      ) : hasSuccess ? (
        <Check className="w-3 h-3 shrink-0" />
      ) : (
        <Icon className="w-3 h-3 shrink-0" />
      )}
      <span className="truncate">
        {isLoading ? c.loadingText : hasError ? result.error : c.doneText}
      </span>
    </div>
  );
}
