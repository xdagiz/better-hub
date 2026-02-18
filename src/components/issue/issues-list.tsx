"use client";

import {
  useState,
  useMemo,
  useCallback,
  useTransition,
  useRef,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CircleDot,
  CheckCircle2,
  MessageSquare,
  Clock,
  X,
  ThumbsUp,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { CreateIssueDialog } from "./create-issue-dialog";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  ListSearchInput,
  OpenClosedToggle,
  SortCycleButton,
  FiltersButton,
  ClearFiltersButton,
  InfiniteScrollSentinel,
  LoadingOverlay,
} from "@/components/shared/list-controls";
import { LabelBadge } from "@/components/shared/label-badge";

interface IssueUser {
  login: string;
  avatar_url: string;
}

interface Issue {
  id: number;
  number: number;
  title: string;
  state: string;
  updated_at: string;
  created_at: string;
  closed_at: string | null;
  comments: number;
  user: IssueUser | null;
  labels: Array<{ name?: string; color?: string }>;
  assignees: IssueUser[];
  milestone: { title: string } | null;
  reactions: { total_count: number; "+1": number };
}

type SortType = "updated" | "newest" | "oldest" | "comments" | "reactions";
type AssigneeFilter = "all" | "assigned" | "unassigned";
type ActivityFilter = "all" | "most-active" | "no-response" | "quiet";

const sortLabels: Record<SortType, string> = {
  updated: "Updated",
  newest: "Newest",
  oldest: "Oldest",
  comments: "Comments",
  reactions: "Reactions",
};

const sortCycle: SortType[] = [
  "updated",
  "newest",
  "oldest",
  "comments",
  "reactions",
];

export function IssuesList({
  owner,
  repo,
  openIssues,
  closedIssues,
  openCount,
  closedCount,
  onAuthorFilter,
}: {
  owner: string;
  repo: string;
  openIssues: Issue[];
  closedIssues: Issue[];
  openCount: number;
  closedCount: number;
  onAuthorFilter?: (
    owner: string,
    repo: string,
    author: string
  ) => Promise<{ open: Issue[]; closed: Issue[] }>;
}) {
  const [state, setState] = useState<"open" | "closed">("open");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortType>("updated");
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [authorSearch, setAuthorSearch] = useState("");
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const authorRef = useRef<HTMLDivElement>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [authorIssues, setAuthorIssues] = useState<{
    open: Issue[];
    closed: Issue[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(
    null
  );

  const allIssues = useMemo(
    () => [...openIssues, ...closedIssues],
    [openIssues, closedIssues]
  );

  const authors = useMemo(() => {
    const seen = new Map<string, IssueUser>();
    for (const issue of allIssues) {
      if (issue.user && !seen.has(issue.user.login)) {
        seen.set(issue.user.login, issue.user);
      }
    }
    return [...seen.values()];
  }, [allIssues]);

  const filteredAuthors = useMemo(() => {
    if (!authorSearch) return authors.slice(0, 8);
    const q = authorSearch.toLowerCase();
    return authors
      .filter((a) => a.login.toLowerCase().includes(q))
      .slice(0, 8);
  }, [authors, authorSearch]);

  const selectedAuthorData = useMemo(
    () => authors.find((a) => a.login === selectedAuthor) ?? null,
    [authors, selectedAuthor]
  );

  useClickOutside(authorRef, useCallback(() => setAuthorDropdownOpen(false), []));
  useClickOutside(filtersRef, useCallback(() => setFiltersOpen(false), []));

  const labels = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const issue of allIssues) {
      for (const label of issue.labels) {
        if (label.name && !seen.has(label.name)) {
          seen.set(label.name, {
            name: label.name,
            color: label.color || "888",
          });
        }
      }
    }
    return [...seen.values()].slice(0, 10);
  }, [allIssues]);

  const milestones = useMemo(() => {
    const seen = new Set<string>();
    for (const issue of allIssues) {
      if (issue.milestone?.title) seen.add(issue.milestone.title);
    }
    return [...seen].slice(0, 8);
  }, [allIssues]);

  const activeFilterCount =
    (assigneeFilter !== "all" ? 1 : 0) +
    (activityFilter !== "all" ? 1 : 0) +
    (selectedMilestone ? 1 : 0) +
    (selectedAuthor ? 1 : 0) +
    (selectedLabel ? 1 : 0);

  const clearAllFilters = () => {
    setSearch("");
    setSelectedAuthor(null);
    setAuthorSearch("");
    setAuthorIssues(null);
    setSelectedLabel(null);
    setAssigneeFilter("all");
    setActivityFilter("all");
    setSelectedMilestone(null);
  };

  const currentOpenIssues = authorIssues ? authorIssues.open : openIssues;
  const currentClosedIssues = authorIssues
    ? authorIssues.closed
    : closedIssues;
  const baseIssues =
    state === "open" ? currentOpenIssues : currentClosedIssues;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return baseIssues
      .filter((issue) => {
        if (q) {
          const matchesNumber = q.startsWith("#")
            ? issue.number.toString().startsWith(q.slice(1))
            : false;
          const matchesSearch =
            matchesNumber ||
            issue.title.toLowerCase().includes(q) ||
            issue.user?.login.toLowerCase().includes(q) ||
            issue.labels.some((l) => l.name?.toLowerCase().includes(q)) ||
            (issue.milestone?.title?.toLowerCase().includes(q) ?? false);
          if (!matchesSearch) return false;
        }
        if (
          !authorIssues &&
          selectedAuthor &&
          issue.user?.login !== selectedAuthor
        )
          return false;
        if (
          selectedLabel &&
          !issue.labels.some((l) => l.name === selectedLabel)
        )
          return false;
        if (
          assigneeFilter === "assigned" &&
          (issue.assignees?.length ?? 0) === 0
        )
          return false;
        if (
          assigneeFilter === "unassigned" &&
          (issue.assignees?.length ?? 0) > 0
        )
          return false;
        if (activityFilter === "most-active" && (issue.comments ?? 0) < 5)
          return false;
        if (activityFilter === "no-response" && (issue.comments ?? 0) > 0)
          return false;
        if (activityFilter === "quiet" && (issue.comments ?? 0) > 2)
          return false;
        if (
          selectedMilestone &&
          issue.milestone?.title !== selectedMilestone
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "newest":
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          case "oldest":
            return (
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
            );
          case "comments":
            return (b.comments ?? 0) - (a.comments ?? 0);
          case "reactions":
            return (
              (b.reactions?.total_count ?? 0) -
              (a.reactions?.total_count ?? 0)
            );
          default:
            return (
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime()
            );
        }
      });
  }, [
    baseIssues,
    search,
    sort,
    selectedAuthor,
    selectedLabel,
    assigneeFilter,
    activityFilter,
    selectedMilestone,
    authorIssues,
  ]);

  const { visible, hasMore, loadMore, sentinelRef } = useInfiniteScroll(
    filtered,
    [state, search, sort, selectedAuthor, selectedLabel, assigneeFilter, activityFilter, selectedMilestone]
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background pb-4 pt-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
        {/* Row 1: Search + Open/Closed + Sort + Filters + Clear */}
        <div className="flex items-center gap-2 mb-3">
          <ListSearchInput
            placeholder="Search issues..."
            value={search}
            onChange={setSearch}
          />

          <OpenClosedToggle
            state={state}
            counts={{
              open: authorIssues ? currentOpenIssues.length : openCount,
              closed: authorIssues ? currentClosedIssues.length : closedCount,
            }}
            icons={{
              open: <CircleDot className="w-3 h-3" />,
              closed: <CheckCircle2 className="w-3 h-3" />,
            }}
            onStateChange={setState}
          />

          <SortCycleButton
            sort={sort}
            cycle={sortCycle}
            labels={sortLabels}
            onSort={setSort}
          />

          <div ref={filtersRef} className="relative">
            <FiltersButton
              open={filtersOpen}
              activeCount={activeFilterCount}
              onToggle={() => setFiltersOpen((v) => !v)}
            />

            {filtersOpen && (
              <div className="absolute z-30 top-full right-0 mt-1.5 w-72 border border-border bg-background shadow-xl rounded-lg overflow-hidden">
                {/* Activity */}
                <div className="px-3 pt-3 pb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                    Activity
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(
                      [
                        ["all", "All"],
                        ["most-active", "Most Active"],
                        ["no-response", "No Response"],
                        ["quiet", "Quiet"],
                      ] as [ActivityFilter, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setActivityFilter(value)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer",
                          activityFilter === value
                            ? "bg-foreground/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-200/60 dark:border-zinc-800/60" />

                {/* Assignee */}
                <div className="px-3 pt-2 pb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                    Assignee
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(
                      [
                        ["all", "All"],
                        ["assigned", "Assigned"],
                        ["unassigned", "Unassigned"],
                      ] as [AssigneeFilter, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setAssigneeFilter(value)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer",
                          assigneeFilter === value
                            ? "bg-foreground/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-200/60 dark:border-zinc-800/60" />

                {/* Author */}
                <div className="px-3 pt-2 pb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                    Author
                  </span>
                  <div className="mt-1.5" ref={authorRef}>
                    {selectedAuthor && selectedAuthorData ? (
                      <button
                        onClick={() => {
                          setSelectedAuthor(null);
                          setAuthorSearch("");
                          setAuthorIssues(null);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono rounded bg-foreground/10 text-foreground transition-colors cursor-pointer"
                      >
                        <Image
                          src={selectedAuthorData.avatar_url}
                          alt={selectedAuthorData.login}
                          width={14}
                          height={14}
                          className="rounded-full"
                        />
                        {selectedAuthorData.login}
                        <X className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search authors..."
                          value={authorSearch}
                          onChange={(e) => {
                            setAuthorSearch(e.target.value);
                            setAuthorDropdownOpen(true);
                          }}
                          onFocus={() => setAuthorDropdownOpen(true)}
                          className="w-full bg-transparent border border-border px-2 py-1 text-[10px] font-mono rounded placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
                        />
                        {authorDropdownOpen && filteredAuthors.length > 0 && (
                          <div className="absolute z-40 top-full left-0 mt-1 w-full border border-border bg-background shadow-lg max-h-36 overflow-y-auto rounded">
                            {filteredAuthors.map((author) => (
                              <button
                                key={author.login}
                                onClick={() => {
                                  setSelectedAuthor(author.login);
                                  setAuthorSearch("");
                                  setAuthorDropdownOpen(false);
                                  if (onAuthorFilter) {
                                    startTransition(async () => {
                                      const result = await onAuthorFilter(
                                        owner,
                                        repo,
                                        author.login
                                      );
                                      setAuthorIssues(
                                        result as {
                                          open: Issue[];
                                          closed: Issue[];
                                        }
                                      );
                                    });
                                  }
                                }}
                                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3 hover:text-foreground transition-colors cursor-pointer"
                              >
                                <Image
                                  src={author.avatar_url}
                                  alt={author.login}
                                  width={14}
                                  height={14}
                                  className="rounded-full"
                                />
                                {author.login}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Labels */}
                {labels.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200/60 dark:border-zinc-800/60" />
                    <div className="px-3 pt-2 pb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                        Label
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {labels.map((label) => (
                          <button
                            key={label.name}
                            onClick={() =>
                              setSelectedLabel((l) =>
                                l === label.name ? null : label.name
                              )
                            }
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer",
                              selectedLabel === label.name
                                ? "bg-foreground/10 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5"
                            )}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: `#${label.color}` }}
                            />
                            {label.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Milestone */}
                {milestones.length > 0 && (
                  <>
                    <div className="border-t border-zinc-200/60 dark:border-zinc-800/60" />
                    <div className="px-3 pt-2 pb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
                        Milestone
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {milestones.map((ms) => (
                          <button
                            key={ms}
                            onClick={() =>
                              setSelectedMilestone((m) =>
                                m === ms ? null : ms
                              )
                            }
                            className={cn(
                              "px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer",
                              selectedMilestone === ms
                                ? "bg-foreground/10 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5"
                            )}
                          >
                            {ms}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <>
                    <div className="border-t border-zinc-200/60 dark:border-zinc-800/60" />
                    <button
                      onClick={() => { clearAllFilters(); setFiltersOpen(false); }}
                      className="flex items-center gap-1.5 w-full px-3 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      Clear all filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <ClearFiltersButton show={activeFilterCount > 0} onClear={clearAllFilters} />

          <div className="ml-auto">
            <CreateIssueDialog owner={owner} repo={repo} />
          </div>
        </div>

        {/* Row 2: Count */}
        <p className="text-xs text-muted-foreground/50 font-mono mb-3">
          Showing {filtered.length} of{" "}
          {authorIssues
            ? baseIssues.length
            : state === "open"
              ? openCount
              : closedCount}{" "}
          issues
        </p>
      </div>

      {/* Issue List */}
      <div className="relative flex-1 min-h-0 overflow-y-auto border border-border divide-y divide-border">
        <LoadingOverlay show={isPending} />
        {visible.map((issue) => {
          const reactionCount = issue.reactions?.["+1"] ?? 0;

          return (
            <Link
              key={issue.id}
              href={`/repos/${owner}/${repo}/issues/${issue.number}`}
              className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
            >
              {issue.state === "open" ? (
                <CircleDot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-400" />
              )}
              <div className="flex-1 min-w-0">
                {/* Row 1: Title + Milestone badge + Labels + Assignee avatars */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm truncate group-hover:text-foreground transition-colors">
                    {issue.title}
                  </span>
                  {issue.milestone && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 border border-zinc-300/60 dark:border-zinc-700/60 text-muted-foreground/70 shrink-0">
                      {issue.milestone.title}
                    </span>
                  )}
                  {issue.labels
                    .filter((l) => l.name)
                    .slice(0, 3)
                    .map((label) => (
                      <LabelBadge key={label.name} label={label} />
                    ))}
                  {/* Assignee avatars — far right */}
                  {(issue.assignees?.length ?? 0) > 0 && (
                    <span className="flex items-center ml-auto shrink-0 -space-x-1.5">
                      {(issue.assignees ?? []).slice(0, 3).map((a) => (
                        <Image
                          key={a.login}
                          src={a.avatar_url}
                          alt={a.login}
                          width={16}
                          height={16}
                          className="rounded-full border border-zinc-200 dark:border-zinc-800"
                          title={`Assignee: ${a.login}`}
                        />
                      ))}
                    </span>
                  )}
                </div>

                {/* Row 2: Author avatar + login + opened X ago */}
                <div className="flex items-center gap-3 mt-1">
                  {issue.user && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <Image
                        src={issue.user.avatar_url}
                        alt={issue.user.login}
                        width={14}
                        height={14}
                        className="rounded-full"
                      />
                      <span className="font-mono text-[10px]">
                        {issue.user.login}
                      </span>
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/50">
                    opened {timeAgo(issue.created_at)}
                  </span>
                </div>

                {/* Row 3: #number + updated X ago + comments + reactions */}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    #{issue.number}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                    <Clock className="w-3 h-3" />
                    {timeAgo(issue.updated_at)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                    <MessageSquare className="w-3 h-3" />
                    {issue.comments ?? 0}
                  </span>
                  {reactionCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                      <ThumbsUp className="w-3 h-3" />
                      {reactionCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        <InfiniteScrollSentinel
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadMore={loadMore}
          remaining={filtered.length - visible.length}
        />

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <CircleDot className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              {search || activeFilterCount > 0
                ? "No issues match your filters"
                : `No ${state} issues`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
