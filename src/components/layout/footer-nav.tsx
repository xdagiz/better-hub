"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "@/lib/auth-client";
import {
  Compass,
  FolderGit2,
  GitPullRequest,
  Search,
  LogOut,
  Settings,
  UserPlus,
  ChevronUp,
  Bell,
  Star,
  BookOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Compass, key: "1" },
  { href: "/repos", label: "Repos", icon: FolderGit2, key: "2" },
  { href: "/prs", label: "PRs", icon: GitPullRequest, key: "3" },
  { href: "/search", label: "Search", icon: Search, key: "4" },
  { href: "/settings", label: "Settings", icon: Settings, key: "5" },
];

export function AppFooterNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [overlay, setOverlay] = useState<{
    index: number;
    name: string;
  } | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const keyNum = parseInt(e.key, 10);
      if (keyNum >= 1 && keyNum <= navItems.length) {
        const item = navItems[keyNum - 1];
        if (item) {
          e.preventDefault();
          if (collapsed) setCollapsed(false);
          if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
          setOverlay({ index: keyNum, name: item.label });
          overlayTimeoutRef.current = setTimeout(() => setOverlay(null), 1500);
          router.push(item.href);
        }
      }
    },
    [router, collapsed]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    };
  }, []);

  return (
    <>
      {/* Navigation overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-all duration-300 bg-black/5 dark:bg-black/20 backdrop-blur-[1px]",
          overlay ? "opacity-100" : "opacity-0"
        )}
      >
        {overlay && (
          <div
            className={cn(
              "backdrop-blur-md px-12 py-8 transition-all duration-300",
              overlay ? "scale-100 translate-y-0" : "scale-95 translate-y-2"
            )}
          >
            <div className="flex items-center">
              <span className="mr-3 font-mono text-2xl text-foreground/30">
                0{overlay.index}.
              </span>
              <span className="font-mono text-2xl">{overlay.name}</span>
            </div>
          </div>
        )}
      </div>

      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        {/* Collapsed: small pill with chevron */}
        <button
          onClick={() => setCollapsed(false)}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 bottom-0 flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-background/90 dark:bg-zinc-950/90 backdrop-blur-2xl shadow-sm cursor-pointer transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-75 pointer-events-none"
          )}
        >
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" />
        </button>

        {/* Expanded nav */}
        <div
          className={cn(
            "flex items-stretch rounded-xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 bg-background/80 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-lg shadow-black/[0.06] dark:shadow-black/30 transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] origin-bottom",
            collapsed
              ? "opacity-0 scale-95 translate-y-3 pointer-events-none"
              : "opacity-100 scale-100 translate-y-0 pointer-events-auto"
          )}
        >
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href) || (item.href === "/repos" && (pathname.startsWith("/orgs") || pathname.startsWith("/users")));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] tracking-wider uppercase transition-colors duration-150",
                  isActive
                    ? "text-foreground bg-foreground/[0.06] dark:bg-white/[0.06]"
                    : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}

          {/* User avatar */}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center px-3 py-2.5 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer outline-none">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-mono text-foreground/60">
                      {session.user.name?.charAt(0) || "?"}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={12}
                  className="w-64 p-0"
                >
                  {/* User identity */}
                  <div className="px-3 py-3 flex items-center gap-3">
                    <div className="relative shrink-0">
                      {session.user.image ? (
                        <Image
                          src={session.user.image}
                          alt={session.user.name || "User"}
                          width={36}
                          height={36}
                          className="rounded-full ring-1 ring-border"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground/60 ring-1 ring-border">
                          {session.user.name?.charAt(0) || "?"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {session.user.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground/60 truncate">
                        {session.user.email}
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        window.open(
                          `https://github.com/${session.user.name}`,
                          "_blank"
                        )
                      }
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                      title="View on GitHub"
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/></svg>
                    </button>
                  </div>

                  <DropdownMenuSeparator className="my-0" />

                  {/* Links */}
                  <div className="p-1">
                    <DropdownMenuItem
                      onClick={() =>
                        window.open(
                          `https://github.com/${session.user.name}?tab=repositories`,
                          "_blank"
                        )
                      }
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <BookOpen className="!size-3.5 text-muted-foreground/50" />
                      Your repositories
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        window.open(
                          `https://github.com/${session.user.name}?tab=stars`,
                          "_blank"
                        )
                      }
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <Star className="!size-3.5 text-muted-foreground/50" />
                      Your stars
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        window.open(
                          "https://github.com/notifications",
                          "_blank"
                        )
                      }
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <Bell className="!size-3.5 text-muted-foreground/50" />
                      Notifications
                    </DropdownMenuItem>
                  </div>

                  <DropdownMenuSeparator className="my-0" />

                  {/* Account actions */}
                  <div className="p-1">
                    <DropdownMenuItem
                      onClick={() => router.push("/settings")}
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <Settings className="!size-3.5 text-muted-foreground/50" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        window.location.href = "/";
                      }}
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs"
                    >
                      <UserPlus className="!size-3.5 text-muted-foreground/50" />
                      Switch account
                    </DropdownMenuItem>
                  </div>

                  <DropdownMenuSeparator className="my-0" />

                  {/* Sign out */}
                  <div className="p-1">
                    <DropdownMenuItem
                      onClick={() =>
                        signOut({
                          fetchOptions: {
                            onSuccess: () => {
                              window.location.href = "/";
                            },
                          },
                        })
                      }
                      className="cursor-pointer gap-3 px-2.5 py-1.5 text-xs text-muted-foreground focus:text-foreground"
                    >
                      <LogOut className="!size-3.5" />
                      Sign out
                      <DropdownMenuShortcut>⇧Q</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
          )}

          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center px-2.5 py-2.5 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <ChevronUp className="w-3 h-3 text-muted-foreground/50 rotate-180" />
          </button>
        </div>
      </footer>
    </>
  );
}
