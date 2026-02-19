"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { GhostTabState } from "@/lib/chat-store";

export interface InlineContext {
  filename: string;
  startLine: number;
  endLine: number;
  selectedCode: string;
  side: "LEFT" | "RIGHT";
}

export interface ChatConfig {
  chatType: "pr" | "issue" | "general";
  contextKey: string;
  contextBody: Record<string, any>;
  suggestions?: string[];
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  inputPrefix?: ReactNode;
  repoFileSearch?: { owner: string; repo: string; ref: string };
}

export interface GlobalChatState {
  isOpen: boolean;
  isWorking: boolean;
  chatType: "pr" | "issue" | "general" | null;
  contextKey: string | null;
  contextBody: Record<string, any> | null;
  suggestions: string[];
  placeholder: string;
  emptyTitle: string;
  emptyDescription: string;
  repoFileSearch: { owner: string; repo: string; ref: string } | null;
}

export type AddCodeContextFn = (context: InlineContext) => void;

interface GlobalChatContextValue {
  state: GlobalChatState;
  tabState: GhostTabState;
  openChat: (config: ChatConfig) => void;
  setContext: (config: ChatConfig) => void;
  clearContext: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setIsWorking: (working: boolean) => void;
  addCodeContext: (context: InlineContext) => void;
  registerContextHandler: (fn: AddCodeContextFn) => void;
  addTab: (label?: string) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, label: string) => void;
}

const GlobalChatContext = createContext<GlobalChatContextValue | null>(null);

export function useGlobalChat() {
  const ctx = useContext(GlobalChatContext);
  if (!ctx) {
    throw new Error("useGlobalChat must be used within GlobalChatProvider");
  }
  return ctx;
}

export function useGlobalChatOptional() {
  return useContext(GlobalChatContext);
}

interface GlobalChatProviderProps {
  children: ReactNode;
  initialTabState: GhostTabState;
}

export function GlobalChatProvider({ children, initialTabState }: GlobalChatProviderProps) {
  const [state, setState] = useState<GlobalChatState>({
    isOpen: false,
    isWorking: false,
    chatType: null,
    contextKey: null,
    contextBody: null,
    suggestions: [],
    placeholder: "Ask Ghost...",
    emptyTitle: "Ghost",
    emptyDescription: "Your haunted assistant for all things here.",
    repoFileSearch: null,
  });

  const [tabState, setTabState] = useState<GhostTabState>(initialTabState);

  const contextHandlerRef = useRef<AddCodeContextFn | null>(null);
  // Track open state for synchronous keyboard shortcut checks
  const isOpenRef = useRef(false);
  // Track the contextKey when the panel was last closed, so we can detect context changes on reopen
  const lastClosedContextKeyRef = useRef<string | null>(null);

  // ── Tab mutations (optimistic + fire-and-forget POST) ──────────────

  const addTab = useCallback((contextLabel?: string) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let label = "";
    let counter = 0;
    setTabState((prev) => {
      counter = prev.counter + 1;
      label = contextLabel || `Thread ${counter}`;
      return {
        tabs: [...prev.tabs, { id, label }],
        activeTabId: id,
        counter,
      };
    });
    // Fire-and-forget persist with client-generated ID
    // Use setTimeout so the setter has resolved and counter/label are set
    setTimeout(() => {
      fetch("/api/ai/ghost-tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", tabId: id, label, counter }),
      }).catch(() => {});
    }, 0);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    let newDefault: { id: string; label: string; counter: number } | undefined;
    setTabState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === tabId);
      const remaining = prev.tabs.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        newDefault = { id, label: "Thread 1", counter: 1 };
        return { tabs: [{ id, label: "Thread 1" }], activeTabId: id, counter: 1 };
      }
      let newActiveId = prev.activeTabId;
      if (prev.activeTabId === tabId) {
        const newIdx = Math.min(idx, remaining.length - 1);
        newActiveId = remaining[newIdx].id;
      }
      return { ...prev, tabs: remaining, activeTabId: newActiveId };
    });
    // Fire-and-forget persist
    setTimeout(() => {
      fetch("/api/ai/ghost-tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", tabId, newDefault }),
      }).catch(() => {});
    }, 0);
  }, []);

  const switchTab = useCallback((tabId: string) => {
    setTabState((prev) => ({ ...prev, activeTabId: tabId }));
    // Persist (fire-and-forget, no reconciliation needed for switch)
    fetch("/api/ai/ghost-tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "switch", tabId }),
    }).catch(() => {});
  }, []);

  const renameTab = useCallback((tabId: string, label: string) => {
    setTabState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    }));
    fetch("/api/ai/ghost-tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", tabId, label }),
    }).catch(() => {});
  }, []);

  // ── Existing chat state logic ──────────────────────────────────────

  const setContext = useCallback((config: ChatConfig) => {
    setState((prev) => ({
      ...prev,
      chatType: config.chatType,
      contextKey: config.contextKey,
      contextBody: config.contextBody,
      suggestions: config.suggestions ?? [],
      placeholder: config.placeholder ?? "Ask Ghost...",
      emptyTitle: config.emptyTitle ?? "Ghost",
      emptyDescription: config.emptyDescription ?? "Your haunted assistant for all things here.",
      repoFileSearch: config.repoFileSearch ?? null,
    }));
  }, []);

  const clearContext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      chatType: null,
      contextKey: null,
      contextBody: null,
      suggestions: [],
      placeholder: "Ask Ghost...",
      emptyTitle: "Ghost",
      emptyDescription: "Your haunted assistant for all things here.",
      repoFileSearch: null,
    }));
  }, []);

  const focusGhostInput = useCallback(() => {
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>("[data-ghost-input]");
      el?.focus();
    }, 100);
  }, []);

  const openChat = useCallback((config: ChatConfig) => {
    setContext(config);
    setState((prev) => ({ ...prev, isOpen: true }));
    isOpenRef.current = true;
    focusGhostInput();
  }, [setContext, focusGhostInput]);

  const closeChat = useCallback(() => {
    setState((prev) => {
      lastClosedContextKeyRef.current = prev.contextKey;
      return { ...prev, isOpen: false };
    });
    isOpenRef.current = false;
  }, []);

  const toggleChat = useCallback(() => {
    setState((prev) => {
      const opening = !prev.isOpen;
      isOpenRef.current = opening;
      if (opening) {
        // Opening: if context changed since last close, open a new tab
        if (
          lastClosedContextKeyRef.current !== null &&
          prev.contextKey !== null &&
          prev.contextKey !== lastClosedContextKeyRef.current
        ) {
          addTab();
        }
        focusGhostInput();
      } else {
        lastClosedContextKeyRef.current = prev.contextKey;
      }
      return { ...prev, isOpen: opening };
    });
  }, [focusGhostInput, addTab]);

  const setIsWorking = useCallback((working: boolean) => {
    setState((prev) => (prev.isWorking === working ? prev : { ...prev, isWorking: working }));
  }, []);

  const addCodeContext = useCallback((context: InlineContext) => {
    setState((prev) => ({ ...prev, isOpen: true }));
    setTimeout(() => {
      contextHandlerRef.current?.(context);
    }, 50);
    focusGhostInput();
  }, [focusGhostInput]);

  const registerContextHandler = useCallback((fn: AddCodeContextFn) => {
    contextHandlerRef.current = fn;
  }, []);

  // Cmd+I / Ctrl+I to toggle AI panel, Cmd+N to add tab when open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        toggleChat();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && isOpenRef.current) {
        e.preventDefault();
        addTab();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [addTab, toggleChat]);

  return (
    <GlobalChatContext.Provider
      value={{
        state,
        tabState,
        openChat,
        setContext,
        clearContext,
        closeChat,
        toggleChat,
        setIsWorking,
        addCodeContext,
        registerContextHandler,
        addTab,
        closeTab,
        switchTab,
        renameTab,
      }}
    >
      {children}
    </GlobalChatContext.Provider>
  );
}
