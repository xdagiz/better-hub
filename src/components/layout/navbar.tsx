"use client";

import Link from "next/link";
import { CommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppNavbar() {
  return (
    <header className="fixed top-0 h-10 flex w-full flex-col bg-background backdrop-blur-lg z-10">
      <nav className="top-0 flex h-full items-center justify-between border-zinc-200/80 px-4 md:border-b dark:border-zinc-800/80">
        <div className="flex items-center gap-0" id="navbar-breadcrumb">
          <Link
            className="shrink-0 text-foreground transition-colors text-xs tracking-tight"
            href="/dashboard"
          >
            BETTER-HUB.
          </Link>
        </div>
        <div className="relative flex items-center justify-end gap-1">
          <CommandMenu />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
