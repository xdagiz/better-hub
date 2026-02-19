"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  GitPullRequest,
  Search,
  Star,
  Settings,
  ExternalLink,
  LogOut,
  Loader2,
  ChevronRight,
  Ghost,
  Palette,
  Check,
  Moon,
  Sun,
  CircleDot,
  History,
} from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn, formatNumber } from "@/lib/utils";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { getRecentViews, type RecentViewItem } from "@/lib/recent-views";
import { useColorTheme } from "@/components/theme/theme-provider";


interface SearchRepo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  owner: {
    login: string;
    avatar_url: string;
  } | null;
}

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4F5D95",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
};

type Mode = "commands" | "search" | "theme";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("commands");
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const globalChat = useGlobalChatOptional();
  const { colorTheme, setColorTheme, themes: colorThemes, mode: _colorMode } = useColorTheme();

  // Recently viewed
  const [recentViews, setRecentViews] = useState<RecentViewItem[]>([]);

  // Repo search state
  const userReposRef = useRef<SearchRepo[]>([]);
  const [userReposLoaded, setUserReposLoaded] = useState(false);
  const [githubResults, setGithubResults] = useState<SearchRepo[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load recent views when menu opens
  useEffect(() => {
    if (open) setRecentViews(getRecentViews());
  }, [open]);

  // Fetch user repos on first open (cached in ref)
  useEffect(() => {
    if (!open || userReposLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-repos");
        if (res.ok && !cancelled) {
          const data = await res.json();
          userReposRef.current = data.repos ?? [];
          setUserReposLoaded(true);
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [open, userReposLoaded]);

  const navigationItems = useMemo(
    () => [
      { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, shortcut: "1" },
      { name: "Repositories", path: "/repos", icon: FolderGit2, shortcut: "2" },
      { name: "PRs", path: "/prs", icon: GitPullRequest, shortcut: "3" },
      { name: "Search Code", path: "/search", icon: Search, shortcut: "4" },
      { name: "Settings", path: "/settings", icon: Settings, shortcut: "5" },
    ],
    []
  );

  // Cmd+K, "/", Escape, and global 1-5 number key shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        setMode("search");
        setSearch("");
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
      // Global 1-5 number key navigation (when menu is closed)
      if (!open && ["1", "2", "3", "4", "5"].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        const nav = navigationItems.find((n) => n.shortcut === e.key);
        if (nav) {
          e.preventDefault();
          router.push(nav.path);
        }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, navigationItems, router]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setSearch("");
        setSelectedIndex(0);
        setGithubResults([]);
        setGithubLoading(false);
        setMode("commands");
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced GitHub search only in search mode
  useEffect(() => {
    if (!open || mode !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = search.trim();
    if (!q) {
      setGithubResults([]);
      setGithubLoading(false);
      return;
    }

    setGithubLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, per_page: "10" });
        const res = await fetch(`/api/search-repos?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.items ?? []).map((r: any) => ({
            id: r.id,
            full_name: r.full_name,
            description: r.description ?? null,
            language: r.language ?? null,
            stargazers_count: r.stargazers_count ?? 0,
            owner: r.owner
              ? { login: r.owner.login, avatar_url: r.owner.avatar_url }
              : null,
          }));
          setGithubResults(items);
        }
      } catch {
        // silent
      } finally {
        setGithubLoading(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open, mode]);

  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    setSearch("");
    setSelectedIndex(0);
    setGithubResults([]);
    setGithubLoading(false);
  }, []);


  const tools = useMemo(() => [
    ...(globalChat ? [{
      name: globalChat.state.isOpen ? "Close Ghost" : "Open Ghost",
      description: "AI assistant",
      action: () => globalChat.toggleChat(),
      icon: Ghost,
      shortcut: "⌘I",
    }] : []),
    {
      name: "Search Repos",
      description: "Find repositories",
      action: () => switchMode("search"),
      icon: Search,
      keepOpen: true,
    },
    {
      name: "Change Theme",
      description: "Switch color theme",
      action: () => switchMode("theme"),
      icon: Palette,
      keepOpen: true,
    },
    {
      name: "New Repository",
      description: "Create a new repo on GitHub",
      action: () => window.open("https://github.com/new", "_blank"),
      icon: FolderGit2,
    },
    {
      name: "Open GitHub",
      description: "Go to github.com",
      action: () => window.open("https://github.com", "_blank"),
      icon: ExternalLink,
    },
    {
      name: "Starred Repos",
      description: "View your starred repositories",
      action: () => router.push("/starred"),
      icon: Star,
    },
  ], [router, switchMode, globalChat]);

  // --- Commands mode items ---
  const filteredTools = useMemo(() => {
    if (!search) return tools;
    const s = search.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        t.description.toLowerCase().includes(s)
    );
  }, [search, tools]);

  const hasQuery = search.trim().length > 0;

  const filteredRecentViews = useMemo(() => {
    if (hasQuery) {
      const s = search.toLowerCase();
      return recentViews.filter(
        (v) =>
          v.title.toLowerCase().includes(s) ||
          v.subtitle.toLowerCase().includes(s) ||
          (v.number && String(v.number).includes(s))
      ).slice(0, 5);
    }
    return recentViews.slice(0, 5);
  }, [recentViews, search, hasQuery]);

  const commandItems = useMemo(() => {
    const items: { id: string; type: "tool" | "recent"; action: () => void; keepOpen?: boolean }[] = [];
    filteredTools.forEach((t) =>
      items.push({ id: `tool-${t.name}`, type: "tool", action: t.action, keepOpen: t.keepOpen })
    );
    // Recently viewed
    filteredRecentViews.forEach((v) =>
      items.push({ id: `recent-${v.url}`, type: "recent", action: () => router.push(v.url) })
    );
    // Sign out
    items.push({
      id: "account-signout",
      type: "tool",
      action: () =>
        signOut({
          fetchOptions: {
            onSuccess: () => { window.location.href = "/"; },
          },
        }),
    });
    return items;
  }, [filteredTools, filteredRecentViews, router]);

  // --- Search mode items ---
  const filteredUserRepos = useMemo(() => {
    if (mode !== "search" || !search.trim()) return [];
    const s = search.toLowerCase();
    return userReposRef.current.filter(
      (r) =>
        r.full_name.toLowerCase().includes(s) ||
        (r.description && r.description.toLowerCase().includes(s))
    ).slice(0, 8);
  }, [search, mode, userReposLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const dedupedGithubResults = useMemo(() => {
    if (mode !== "search" || !search.trim()) return [];
    const userRepoNames = new Set(filteredUserRepos.map((r) => r.full_name));
    return githubResults.filter((r) => !userRepoNames.has(r.full_name)).slice(0, 8);
  }, [search, mode, githubResults, filteredUserRepos]);

  // Top repos when search is empty in search mode
  const topUserRepos = useMemo(() => {
    if (mode !== "search" || search.trim()) return [];
    return userReposRef.current.slice(0, 10);
  }, [mode, search, userReposLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchItems = useMemo(() => {
    const items: { id: string; action: () => void }[] = [];
    if (!search.trim()) {
      topUserRepos.forEach((r) =>
        items.push({
          id: `top-repo-${r.id}`,
          action: () => router.push(`/${r.full_name}`),
        })
      );
    } else {
      filteredUserRepos.forEach((r) =>
        items.push({
          id: `user-repo-${r.id}`,
          action: () => router.push(`/${r.full_name}`),
        })
      );
      dedupedGithubResults.forEach((r) =>
        items.push({
          id: `gh-repo-${r.id}`,
          action: () => router.push(`/${r.full_name}`),
        })
      );
    }
    return items;
  }, [search, topUserRepos, filteredUserRepos, dedupedGithubResults, router]);

  // --- Theme mode items ---
  const filteredThemes = useMemo(() => {
    if (mode !== "theme") return colorThemes;
    if (!search.trim()) return colorThemes;
    const s = search.toLowerCase();
    return colorThemes.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        t.description.toLowerCase().includes(s)
    );
  }, [mode, search, colorThemes]);

  const themeItems = useMemo(() => {
    return filteredThemes.map((t) => ({
      id: `theme-${t.id}`,
      action: () => setColorTheme(t.id),
      keepOpen: true,
    }));
  }, [filteredThemes, setColorTheme]);

  const allItems = mode === "commands" ? commandItems : mode === "search" ? searchItems : themeItems;

  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length, search]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Tab cycles modes: commands → search → theme → commands
      if (e.key === "Tab") {
        e.preventDefault();
        if (mode === "commands") switchMode("search");
        else if (mode === "search") switchMode("theme");
        else switchMode("commands");
        return;
      }

      // "/" in commands mode switches to search
      if (e.key === "/" && mode === "commands" && !search) {
        e.preventDefault();
        switchMode("search");
        return;
      }

      // Backspace on empty in search/theme mode goes back to commands
      if (e.key === "Backspace" && (mode === "search" || mode === "theme") && !search) {
        e.preventDefault();
        switchMode("commands");
        return;
      }

      // Number shortcuts in commands mode
      if (mode === "commands" && !hasQuery && ["1", "2", "3", "4", "5"].includes(e.key)) {
        const nav = navigationItems.find((n) => n.shortcut === e.key);
        if (nav) {
          e.preventDefault();
          setOpen(false);
          router.push(nav.path);
          return;
        }
      }

      if (allItems.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % allItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + allItems.length) % allItems.length);
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex]) {
            const item = allItems[selectedIndex];
            if ("keepOpen" in item && item.keepOpen) {
              item.action();
            } else {
              runCommand(item.action);
            }
          }
          break;
      }
    },
    [allItems, selectedIndex, hasQuery, navigationItems, router, switchMode, runCommand, mode, search]
  );

  // Render helpers — track item indices
  let currentItemIndex = -1;
  const getNextIndex = () => ++currentItemIndex;

  if (!mounted) return null;

  return (
    <>
      {/* Navbar trigger */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md bg-muted/30 hover:bg-muted/50"
      >
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">&#x2318;</span>K
        </kbd>
      </button>

      {createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-50 bg-black/25 dark:bg-black/70 transition-opacity duration-150",
              open ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Command Menu"
            className={cn(
              "fixed z-50 left-1/2 -translate-x-1/2 w-full rounded-lg border shadow-lg overflow-hidden",
              "border-border/60 dark:border-white/6 bg-background",
              "transition-all duration-150",
              open
                ? "opacity-100 scale-100 translate-y-0"
                : "opacity-0 scale-[0.98] -translate-y-1 pointer-events-none",
              "max-w-xl top-[20%]"
            )}
            style={{ maxWidth: "36rem" }}
          >
            <span className="sr-only">Command Menu</span>

              <>
                {/* Input area */}
                <div className="flex items-center border-b border-border dark:border-white/6 px-3 gap-2">
                  {mode === "search" ? (
                    <Search className="size-4 text-muted-foreground/50 shrink-0" />
                  ) : mode === "theme" ? (
                    <Palette className="size-4 text-muted-foreground/50 shrink-0" />
                  ) : (
                    <Search className="size-4 text-muted-foreground/30 shrink-0" />
                  )}
                  <input
                    ref={inputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      mode === "search"
                        ? "Search repos and content..."
                        : mode === "theme"
                        ? "Search themes..."
                        : "Type a command..."
                    }
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/40 py-3 text-sm outline-none"
                  />
                  <div className="flex items-center gap-1">
                    {githubLoading && (
                      <Loader2 className="size-3.5 text-muted-foreground/40 animate-spin shrink-0" />
                    )}
                    {mode === "commands" && (
                      <button
                        onClick={() => switchMode("search")}
                        className="inline-flex h-5.5 items-center gap-1 rounded-sm border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1.5 text-[10px] text-muted-foreground/60 cursor-pointer hover:text-foreground hover:border-foreground/15 transition-colors"
                      >
                        /
                      </button>
                    )}
                  </div>
                </div>

                {/* Results */}
                <div ref={listRef} className="overflow-y-auto max-h-[400px]">
                  {mode === "commands" ? (
                    <>
                      {/* Tools group */}
                      {filteredTools.length > 0 && (
                        <CommandGroup title="Commands">
                          {filteredTools.map((tool) => {
                            const idx = getNextIndex();
                            return (
                              <CommandItemButton
                                key={tool.name}
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() => tool.keepOpen ? tool.action() : runCommand(tool.action)}
                              >
                                <tool.icon className="size-3.5 text-muted-foreground/50 shrink-0" />
                                <span className="text-[13px] text-foreground flex-1">{tool.name}</span>
                                <span className="text-[11px] text-muted-foreground/40 hidden sm:block">{tool.description}</span>
                                {tool.shortcut && (
                                  <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1.5 font-mono text-[10px] text-muted-foreground/50 shrink-0">
                                    {tool.shortcut}
                                  </kbd>
                                )}
                              </CommandItemButton>
                            );
                          })}
                        </CommandGroup>
                      )}

                      {/* Recently viewed */}
                      {filteredRecentViews.length > 0 && (
                        <CommandGroup title="Recently viewed">
                          {filteredRecentViews.map((item) => {
                            const idx = getNextIndex();
                            return (
                              <CommandItemButton
                                key={item.url}
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() => runCommand(() => router.push(item.url))}
                              >
                                {item.type === "pr" ? (
                                  <GitPullRequest className={cn("size-3.5 shrink-0", item.state === "merged" ? "text-alert-important" : item.state === "open" ? "text-success" : "text-muted-foreground/50")} />
                                ) : item.type === "issue" ? (
                                  <CircleDot className={cn("size-3.5 shrink-0", item.state === "open" ? "text-success" : "text-muted-foreground/50")} />
                                ) : (
                                  <History className="size-3.5 text-muted-foreground/50 shrink-0" />
                                )}
                                <span className="text-[13px] text-foreground flex-1 truncate">
                                  {item.title}
                                  {item.number && <span className="text-muted-foreground/50 ml-1">#{item.number}</span>}
                                </span>
                                <span className="text-[11px] text-muted-foreground/40 hidden sm:block truncate max-w-[160px]">{item.subtitle}</span>
                              </CommandItemButton>
                            );
                          })}
                        </CommandGroup>
                      )}

                      {/* Account group */}
                      {!hasQuery && (
                        <CommandGroup title="Account">
                          {(() => {
                            const idx = getNextIndex();
                            return (
                              <CommandItemButton
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() =>
                                  runCommand(() =>
                                    signOut({
                                      fetchOptions: {
                                        onSuccess: () => { window.location.href = "/"; },
                                      },
                                    })
                                  )
                                }
                              >
                                <LogOut className="size-3.5 text-muted-foreground/50 shrink-0" />
                                <span className="text-[13px] text-foreground">Sign Out</span>
                              </CommandItemButton>
                            );
                          })()}
                        </CommandGroup>
                      )}

                      {/* No results */}
                      {hasQuery && filteredTools.length === 0 && filteredRecentViews.length === 0 && (
                        <div className="py-8 text-center text-sm text-muted-foreground/70">
                          No commands match &quot;{search}&quot;
                        </div>
                      )}
                    </>
                  ) : mode === "search" ? (
                    /* Search mode */
                    <>
                      {/* Recent / your repos (when no query) */}
                      {!hasQuery && topUserRepos.length > 0 && (
                        <CommandGroup title="Recent repositories">
                          {topUserRepos.map((repo) => {
                            const idx = getNextIndex();
                            return (
                              <RepoItem
                                key={repo.id}
                                repo={repo}
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() => runCommand(() => router.push(`/${repo.full_name}`))}
                              />
                            );
                          })}
                        </CommandGroup>
                      )}

                      {/* Your Repos (with query) */}
                      {hasQuery && filteredUserRepos.length > 0 && (
                        <CommandGroup title="Your repos">
                          {filteredUserRepos.map((repo) => {
                            const idx = getNextIndex();
                            return (
                              <RepoItem
                                key={repo.id}
                                repo={repo}
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() => runCommand(() => router.push(`/${repo.full_name}`))}
                              />
                            );
                          })}
                        </CommandGroup>
                      )}

                      {/* GitHub results */}
                      {hasQuery && (dedupedGithubResults.length > 0 || githubLoading) && (
                        <CommandGroup title={githubLoading && dedupedGithubResults.length === 0 ? "GitHub (searching...)" : "GitHub"}>
                          {dedupedGithubResults.map((repo) => {
                            const idx = getNextIndex();
                            return (
                              <RepoItem
                                key={repo.id}
                                repo={repo}
                                index={idx}
                                selected={selectedIndex === idx}
                                onClick={() => runCommand(() => router.push(`/${repo.full_name}`))}
                              />
                            );
                          })}
                          {githubLoading && dedupedGithubResults.length === 0 && (
                            <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground/60">
                              <Loader2 className="size-3.5 animate-spin" />
                              <span className="text-xs">Searching GitHub...</span>
                            </div>
                          )}
                        </CommandGroup>
                      )}

                      {/* No results */}
                      {hasQuery && filteredUserRepos.length === 0 && dedupedGithubResults.length === 0 && !githubLoading && (
                        <div className="py-8 text-center text-sm text-muted-foreground/70">
                          No results for &quot;{search}&quot;
                        </div>
                      )}

                      {/* Empty search mode hint */}
                      {!hasQuery && topUserRepos.length === 0 && (
                        <div className="py-8 text-center text-sm text-muted-foreground/40">
                          Start typing to search repositories
                        </div>
                      )}
                    </>
                  ) : (
                    /* Theme mode */
                    <>
                      <CommandGroup title="Color Themes">
                        {filteredThemes.map((theme) => {
                          const idx = getNextIndex();
                          const isActive = colorTheme === theme.id;
                          return (
                            <CommandItemButton
                              key={theme.id}
                              index={idx}
                              selected={selectedIndex === idx}
                              onClick={() => setColorTheme(theme.id)}
                            >
                              <span className="flex items-center gap-1 shrink-0">
                                <span
                                  className="w-3 h-3 rounded-full border border-border/40"
                                  style={{ backgroundColor: theme.bgPreview }}
                                />
                                <span
                                  className="w-3 h-3 rounded-full border border-border/40"
                                  style={{ backgroundColor: theme.accentPreview }}
                                />
                              </span>
                              <span className="text-[13px] text-foreground flex-1">{theme.name}</span>
                              <span className="text-[11px] text-muted-foreground/40 hidden sm:block">
                                {theme.mode === "dark" ? <Moon className="inline size-2.5 mr-1" /> : <Sun className="inline size-2.5 mr-1" />}
                                {theme.description}
                              </span>
                              {isActive && (
                                <Check className="size-3.5 text-success shrink-0" />
                              )}
                            </CommandItemButton>
                          );
                        })}
                      </CommandGroup>
                      {hasQuery && filteredThemes.length === 0 && (
                        <div className="py-8 text-center text-sm text-muted-foreground/70">
                          No themes match &quot;{search}&quot;
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/60 dark:border-white/4 bg-muted/30 dark:bg-white/[0.01]">
                  {mode === "commands" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {navigationItems.map((item) => (
                        <button
                          key={item.path}
                          onClick={() => runCommand(() => router.push(item.path))}
                          className="flex items-center gap-1 text-muted-foreground/40 hover:text-foreground transition-colors duration-150 group cursor-pointer"
                        >
                          <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-sm border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 font-mono text-[9px] text-muted-foreground/50 group-hover:text-foreground group-hover:border-foreground/15 transition-all duration-150">
                            {item.shortcut}
                          </span>
                          <span className="text-[10px]">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
                      <span className="inline-flex h-4.5 items-center rounded-sm border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1 font-mono text-[9px]">
                        &#x232B;
                      </span>
                      <span>Back{mode === "theme" ? " to commands" : ""}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/30">
                    <span className="inline-flex h-4.5 items-center rounded-sm border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1 font-mono text-[9px]">
                      Tab
                    </span>
                    <span>switch</span>
                  </div>
                </div>
              </>
          </div>

          {/* Floating Ghost button */}
          {globalChat && (
            <FloatingGhostTrigger
              isOpen={globalChat.state.isOpen}
              isWorking={globalChat.state.isWorking}
              hidden={open || globalChat.state.isOpen}
              onClick={globalChat.toggleChat}
            />
          )}
        </>,
        document.body
      )}
    </>
  );
}

function RepoItem({
  repo,
  index,
  selected,
  onClick,
}: {
  repo: SearchRepo;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-index={index}
      className={cn(
        "w-full group flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 cursor-pointer",
        "hover:bg-accent dark:hover:bg-white/3 focus:outline-none",
        selected && "bg-accent dark:bg-white/3"
      )}
    >
      {repo.owner ? (
        <img
          src={repo.owner.avatar_url}
          alt={repo.owner.login}
          className="w-4 h-4 rounded-full shrink-0"
        />
      ) : (
        <div className="w-4 h-4 rounded-full bg-muted/50 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground font-mono">
          {repo.full_name}
        </span>
        {repo.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {repo.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {repo.language && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: languageColors[repo.language] || "#8b949e" }}
            />
            {repo.language}
          </span>
        )}
        {repo.stargazers_count > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70">
            <Star className="w-3 h-3" />
            {formatNumber(repo.stargazers_count)}
          </span>
        )}
        <ChevronRight className="w-3 h-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function CommandGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider select-none">
        {title}
      </div>
      {children}
    </div>
  );
}

function CommandItemButton({
  children,
  onClick,
  className,
  index,
  selected,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  index?: number;
  selected?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-index={index}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 cursor-pointer",
        "hover:bg-accent dark:hover:bg-white/3 focus:outline-none",
        selected && "bg-accent dark:bg-white/3",
        className
      )}
    >
      {children}
    </button>
  );
}

function FloatingGhostTrigger({
  isOpen,
  isWorking,
  hidden,
  onClick,
}: {
  isOpen: boolean;
  isWorking: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => {
    if (isOpen || isWorking) return;
    const interval = setInterval(() => {
      setShimmer(true);
      setTimeout(() => setShimmer(false), 1200);
    }, 8000);
    return () => clearInterval(interval);
  }, [isOpen, isWorking]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-5 right-5 z-40 inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/60 dark:border-white/8 bg-background/80 backdrop-blur-xl shadow-lg shadow-black/[0.06] dark:shadow-black/30 text-muted-foreground/60 hover:text-foreground transition-all duration-200 cursor-pointer overflow-hidden",
        hidden && "opacity-0 pointer-events-none"
      )}
      title="Ghost (⌘I)"
    >
      <div className="relative w-4 h-4">
        <Ghost
          className={cn(
            "w-4 h-4 absolute inset-0 transition-opacity duration-300",
            isWorking ? "opacity-30" : "opacity-100"
          )}
          strokeWidth={2}
        />
        {/* Idle shimmer */}
        {shimmer && !isWorking && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            className="absolute inset-0 pointer-events-none"
          >
            <defs>
              <clipPath id="floating-ghost-clip">
                <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
              </clipPath>
              <linearGradient id="floating-ghost-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="42%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.4" />
                <stop offset="58%" stopColor="currentColor" stopOpacity="0" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g clipPath="url(#floating-ghost-clip)">
              <rect
                x="0"
                y="0"
                width="24"
                height="24"
                fill="url(#floating-ghost-grad)"
                className="ghost-shimmer"
              />
            </g>
          </svg>
        )}
        {/* Working fill animation */}
        {isWorking && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            className="absolute inset-0"
          >
            <defs>
              <clipPath id="floating-ghost-fill-clip">
                <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
              </clipPath>
            </defs>
            <g clipPath="url(#floating-ghost-fill-clip)">
              <rect
                x="0"
                y="0"
                width="24"
                height="24"
                className="fill-foreground ghost-fill-animation"
              />
            </g>
            <path
              d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            />
          </svg>
        )}
      </div>
    </button>
  );
}
