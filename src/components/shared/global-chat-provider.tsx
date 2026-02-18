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
}

export type AddCodeContextFn = (context: InlineContext) => void;

interface GlobalChatContextValue {
  state: GlobalChatState;
  openChat: (config: ChatConfig) => void;
  setContext: (config: ChatConfig) => void;
  clearContext: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setIsWorking: (working: boolean) => void;
  addCodeContext: (context: InlineContext) => void;
  registerContextHandler: (fn: AddCodeContextFn) => void;
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

export function GlobalChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalChatState>({
    isOpen: false,
    isWorking: false,
    chatType: null,
    contextKey: null,
    contextBody: null,
    suggestions: [],
    placeholder: "Ask Ghost...",
    emptyTitle: "Ghost",
    emptyDescription: "Ask questions and get help",
  });

  const contextHandlerRef = useRef<AddCodeContextFn | null>(null);

  const setContext = useCallback((config: ChatConfig) => {
    setState((prev) => ({
      ...prev,
      chatType: config.chatType,
      contextKey: config.contextKey,
      contextBody: config.contextBody,
      suggestions: config.suggestions ?? [],
      placeholder: config.placeholder ?? "Ask Ghost...",
      emptyTitle: config.emptyTitle ?? "Ghost",
      emptyDescription: config.emptyDescription ?? "Ask questions and get help",
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
      emptyDescription: "Ask questions and get help",
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
    focusGhostInput();
  }, [setContext, focusGhostInput]);

  const closeChat = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const toggleChat = useCallback(() => {
    setState((prev) => {
      if (!prev.isOpen) focusGhostInput();
      return { ...prev, isOpen: !prev.isOpen };
    });
  }, [focusGhostInput]);

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

  // Cmd+I / Ctrl+I keyboard shortcut to toggle AI panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setState((prev) => {
          if (!prev.isOpen) focusGhostInput();
          return { ...prev, isOpen: !prev.isOpen };
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <GlobalChatContext.Provider
      value={{
        state,
        openChat,
        setContext,
        clearContext,
        closeChat,
        toggleChat,
        setIsWorking,
        addCodeContext,
        registerContextHandler,
      }}
    >
      {children}
    </GlobalChatContext.Provider>
  );
}
