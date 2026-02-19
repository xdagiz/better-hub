"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatNumber } from "@/lib/utils";
import {
  ListSearchInput,
  SortCycleButton,
} from "@/components/shared/list-controls";

interface Person {
  login: string;
  avatar_url: string;
  contributions: number;
  weeklyCommits: number[];
  additions: number;
  deletions: number;
  monthAdditions: number;
  monthDeletions: number;
}

interface PeopleListProps {
  owner: string;
  repo: string;
  people: Person[];
}

type SortMode = "contributions" | "total" | "alpha";

const SORT_CYCLE: SortMode[] = ["contributions", "total", "alpha"];
const SORT_LABELS: Record<SortMode, string> = {
  contributions: "This month",
  total: "All-time total",
  alpha: "A → Z",
};

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0 || data.every((d) => d === 0)) {
    return (
      <div className="flex items-end gap-px w-20 shrink-0" style={{ height: 20 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] bg-muted/60"
            style={{ height: 2 }}
          />
        ))}
      </div>
    );
  }

  const max = Math.max(...data, 1);

  return (
    <div
      className="flex items-end gap-px w-20 shrink-0"
      style={{ height: 20 }}
      title={`Last ${data.length} weeks`}
    >
      {data.map((value, i) => {
        const barH = Math.max(2, (value / max) * 20);
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-[1px]",
              value > 0 ? "bg-success/70" : "bg-muted/60"
            )}
            style={{ height: barH }}
          />
        );
      })}
    </div>
  );
}

export function PeopleList({ owner, repo, people }: PeopleListProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("contributions");

  const isMonthly = sort === "contributions";

  const monthTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of people) {
      const last4 = p.weeklyCommits.slice(-4);
      map[p.login.toLowerCase()] = last4.reduce((s, c) => s + c, 0);
    }
    return map;
  }, [people]);

  const maxValue = useMemo(() => {
    if (isMonthly) return Math.max(...Object.values(monthTotals), 1);
    return Math.max(...people.map((p) => p.contributions), 1);
  }, [people, monthTotals, isMonthly]);

  const filtered = useMemo(() => {
    let list = people;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.login.toLowerCase().includes(q));
    }
    if (sort === "contributions") {
      list = [...list].sort(
        (a, b) =>
          (monthTotals[b.login.toLowerCase()] ?? 0) -
          (monthTotals[a.login.toLowerCase()] ?? 0)
      );
    } else if (sort === "total") {
      list = [...list].sort((a, b) => b.contributions - a.contributions);
    } else {
      list = [...list].sort((a, b) =>
        a.login.toLowerCase().localeCompare(b.login.toLowerCase())
      );
    }
    return list;
  }, [people, search, sort, monthTotals]);

  const getCommits = (person: Person) =>
    isMonthly
      ? (monthTotals[person.login.toLowerCase()] ?? 0)
      : person.contributions;

  const getDiff = (person: Person) => ({
    add: isMonthly ? person.monthAdditions : person.additions,
    del: isMonthly ? person.monthDeletions : person.deletions,
  });

  return (
    <div className="p-4 space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <ListSearchInput
          placeholder="Filter by username..."
          value={search}
          onChange={setSearch}
        />
        <SortCycleButton
          sort={sort}
          cycle={SORT_CYCLE}
          labels={SORT_LABELS}
          onSort={setSort}
        />
      </div>

      {/* Count */}
      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
        {filtered.length} contributor{filtered.length !== 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12 border border-border rounded-md">
          <p className="text-xs text-muted-foreground/60 font-mono">
            No contributors found
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          {filtered.map((person, i) => {
            const commits = getCommits(person);
            const { add, del } = getDiff(person);
            const pct = maxValue > 0 ? (commits / maxValue) * 100 : 0;

            return (
              <Link
                key={person.login}
                href={`/${owner}/${repo}/people/${person.login}`}
                className="group flex items-center gap-3.5 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
              >
                {/* Rank */}
                <span className="text-[10px] font-mono text-muted-foreground/40 w-5 text-right tabular-nums shrink-0">
                  {i + 1}
                </span>

                {/* Avatar */}
                <Image
                  src={person.avatar_url}
                  alt={person.login}
                  width={32}
                  height={32}
                  className="rounded-full shrink-0"
                />

                {/* Name + bar */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <span className="text-[13px] font-mono truncate block">
                    {person.login}
                  </span>
                  <div className="h-[3px] w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-success/60 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Sparkline */}
                <Sparkline data={person.weeklyCommits} />

                {/* Diff */}
                {(add > 0 || del > 0) && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-muted-foreground/50 shrink-0">
                    <span className="text-success/70">+{formatNumber(add)}</span>
                    <span className="text-destructive/50">&minus;{formatNumber(del)}</span>
                  </span>
                )}

                {/* Commit count */}
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground/60 shrink-0 w-14 text-right">
                  {commits.toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
