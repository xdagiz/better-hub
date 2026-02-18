"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  GitPullRequest,
  CircleDot,
  Bell,
  Eye,
  Star,
  GitFork,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  FolderGit2,
  GitCommit,
  GitBranch,
  Lock,
  Plus,
  Trash2,
  MessageCircle,
  Settings,
  Flame,
  History,
} from "lucide-react";
import { cn, timeAgo, formatNumber } from "@/lib/utils";
import { toInternalUrl } from "@/lib/github-utils";
import { ContributionChart } from "./contribution-chart";
import { RecentlyViewed } from "./recently-viewed";

interface DashboardContentProps {
  user: {
    login: string;
    avatar_url: string;
    name: string | null;
    public_repos: number;
    followers: number;
    following: number;
  };
  reviewRequests: { items: Array<IssueItem>; total_count: number };
  myOpenPRs: { items: Array<IssueItem>; total_count: number };
  myIssues: { items: Array<IssueItem>; total_count: number };
  repos: Array<RepoItem>;
  notifications: Array<NotificationItem>;
  contributions: {
    totalContributions: number;
    weeks: Array<{
      contributionDays: Array<{
        contributionCount: number;
        date: string;
        color: string;
      }>;
    }>;
  } | null;
  activity: Array<ActivityEvent>;
  trending: Array<TrendingRepoItem>;
}

interface ActivityEvent {
  id: string;
  type: string | null;
  repo: { name: string };
  created_at: string | null;
  payload: {
    action?: string;
    ref?: string | null;
    ref_type?: string;
    commits?: Array<{ message: string; sha: string }>;
    pull_request?: { title: string; number: number; merged?: boolean };
    issue?: { title: string; number: number };
    comment?: { body: string };
    size?: number;
  };
}

interface IssueItem {
  id: number;
  title: string;
  html_url: string;
  number: number;
  state: string;
  created_at: string;
  updated_at: string;
  repository_url: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<{ name?: string; color?: string }>;
  draft?: boolean;
  pull_request?: { merged_at: string | null };
  comments: number;
}

interface RepoItem {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  updated_at: string | null;
  visibility?: string;
  private: boolean;
  open_issues_count: number;
  owner: { login: string; avatar_url: string };
}

interface NotificationItem {
  id: string;
  reason: string;
  subject: { title: string; type: string };
  repository: { full_name: string };
  updated_at: string;
  unread: boolean;
}

interface TrendingRepoItem {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string | null;
  owner: { login: string; avatar_url: string };
}

function extractRepoName(repoUrl: string) {
  const parts = repoUrl.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

const langColor: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Rust: "#dea584", Go: "#00ADD8", Java: "#b07219", Ruby: "#701516",
  Swift: "#F05138", Kotlin: "#A97BFF", "C++": "#f34b7d", "C#": "#178600",
  PHP: "#4F5D95", Vue: "#41b883", Svelte: "#ff3e00", HTML: "#e34c26",
  CSS: "#563d7c", Shell: "#89e051",
};

export function DashboardContent({
  user,
  reviewRequests,
  myOpenPRs,
  myIssues,
  repos,
  notifications,
  contributions,
  activity,
  trending,
}: DashboardContentProps) {
  const greeting = getGreeting();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const hasWork =
    reviewRequests.items.length > 0 ||
    myOpenPRs.items.length > 0 ||
    myIssues.items.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {/* Header */}
      <div className="shrink-0 pb-3">
        <div>
          <h1 className="text-sm font-medium">
            {greeting}, {user.name || user.login}
          </h1>
          <p className="text-[11px] text-muted-foreground font-mono">
            {today}
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 pb-2">
        {/* Left — overview + work items */}
        <div className="lg:w-3/5 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pr-2">
          {/* Stats — fixed */}
          <div className="shrink-0 grid grid-cols-4 gap-3">
            <Stat icon={<Eye className="w-3.5 h-3.5" />} label="Reviews" value={reviewRequests.total_count} accent={reviewRequests.total_count > 0} />
            <Stat icon={<GitPullRequest className="w-3.5 h-3.5" />} label="Open PRs" value={myOpenPRs.total_count} accent={myOpenPRs.total_count > 0} />
            <Stat icon={<CircleDot className="w-3.5 h-3.5" />} label="Issues" value={myIssues.total_count} accent={myIssues.total_count > 0} />
            <Stat icon={<Bell className="w-3.5 h-3.5" />} label="Notifs" value={notifications.filter((n) => n.unread).length} />
          </div>

          {/* Contribution graph — hidden from overview */}

          {/* Tabbed work panel — fills remaining space, content scrolls */}
          <WorkTabs
            reviewRequests={reviewRequests}
            myOpenPRs={myOpenPRs}
            myIssues={myIssues}
            hasWork={hasWork}
          />
        </div>

        {/* Right — repos + activity */}
        <div className="lg:w-2/5 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pl-2">
          {/* Recently Viewed */}
          <RecentlyViewed />

          {/* Repos */}
          <section className="shrink border border-border bg-card flex flex-col min-h-0">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
              <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Repositories
              </h2>
              <button className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {repos.slice(0, 10).map((repo) => (
                <RepoRow key={repo.id} repo={repo} />
              ))}
            </div>
          </section>

          {/* Trending */}
          {trending.length > 0 && (
            <section className="shrink border border-border bg-card flex flex-col min-h-0">
              <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
                <Flame className="w-3 h-3 text-orange-500/70" />
                <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Trending this week
                </h2>
                <Link
                  href="/trending"
                  className="ml-auto flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  See all
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="overflow-y-auto">
                {trending.map((repo) => (
                  <TrendingRow key={repo.id} repo={repo} />
                ))}
              </div>
            </section>
          )}

          {/* Activity timeline */}
          <section className="flex-1 min-h-0 flex flex-col border border-border bg-card">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
              <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Activity
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activity.length > 0 ? (
                activity.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))
              ) : (
                <div className="py-10 text-center">
                  <p className="text-xs text-muted-foreground/50 font-mono">No recent activity</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── WorkTabs ─────────────────────────────────────────────────────── */

type TabKey = "reviews" | "prs" | "issues";

function WorkTabs({
  reviewRequests,
  myOpenPRs,
  myIssues,
  hasWork,
}: {
  reviewRequests: { items: Array<IssueItem>; total_count: number };
  myOpenPRs: { items: Array<IssueItem>; total_count: number };
  myIssues: { items: Array<IssueItem>; total_count: number };
  hasWork: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("reviews");

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "reviews", label: "Needs your review", count: reviewRequests.total_count },
    { key: "prs", label: "PRs", count: myOpenPRs.total_count },
    { key: "issues", label: "Assigned to you", count: myIssues.total_count },
  ];

  if (!hasWork) {
    return (
      <div className="flex-1 min-h-0 border border-border py-12 text-center bg-card">
        <CheckCircle2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground font-mono">
          Nothing needs your attention
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-border bg-card">
      {/* Tab header */}
      <div className="shrink-0 flex items-center border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
              activeTab === tab.key
                ? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
                : "text-muted-foreground hover:text-foreground/60"
            )}
          >
            {tab.label}
            <span className={cn(
              "text-[10px] tabular-nums",
              activeTab === tab.key ? "text-foreground/50" : "text-muted-foreground/50"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "reviews" && (
          reviewRequests.items.length > 0 ? (
            reviewRequests.items.map((pr) => (
              <ItemRow key={pr.id} item={pr} type="pr" />
            ))
          ) : (
            <EmptyTab message="No reviews requested" />
          )
        )}
        {activeTab === "prs" && (
          myOpenPRs.items.length > 0 ? (
            myOpenPRs.items.map((pr) => (
              <ItemRow key={pr.id} item={pr} type="pr" />
            ))
          ) : (
            <EmptyTab message="No open PRs" />
          )
        )}
        {activeTab === "issues" && (
          myIssues.items.length > 0 ? (
            myIssues.items.map((issue) => (
              <ItemRow key={issue.id} item={issue} type="issue" />
            ))
          ) : (
            <EmptyTab message="No assigned issues" />
          )
        )}
      </div>
    </div>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-xs text-muted-foreground/50 font-mono">{message}</p>
    </div>
  );
}

/* ── Stat ──────────────────────────────────────────────────────────── */

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1.5 px-3 py-3 border border-dashed transition-colors",
        accent
          ? "border-foreground/20 dark:border-foreground/10"
          : "border-zinc-300/70 dark:border-zinc-700/50"
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            accent ? "text-foreground/50" : "text-muted-foreground/50"
          )}
        >
          {icon}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-lg font-medium tabular-nums tracking-tight",
            accent ? "text-foreground" : "text-foreground/60"
          )}
        >
          {value}
        </span>
        {accent && value > 0 && (
          <span className="w-1 h-1 rounded-full bg-emerald-500/80 animate-pulse" />
        )}
      </div>
    </div>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────── */

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums ml-auto">
            {count}
          </span>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

/* ── ItemRow (PR / Issue) ──────────────────────────────────────────── */

function ItemRow({ item, type }: { item: IssueItem; type: "pr" | "issue" }) {
  const repo = extractRepoName(item.repository_url);
  const isMerged = type === "pr" && item.pull_request?.merged_at;
  const isDraft = type === "pr" && item.draft;

  return (
    <Link
      href={toInternalUrl(item.html_url)}
      className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-zinc-100 dark:border-zinc-800/40 last:border-b-0"
    >
      {type === "pr" ? (
        <GitPullRequest
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            isMerged ? "text-purple-500" : isDraft ? "text-muted-foreground" : "text-emerald-500"
          )}
        />
      ) : (
        <CircleDot className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block group-hover:text-foreground transition-colors">
          {item.title}
        </span>
        <div className="flex items-center gap-2 mt-px">
          <span className="text-[11px] font-mono text-muted-foreground/70">
            {repo}#{item.number}
          </span>
          <span className="text-[11px] text-muted-foreground/50">
            {timeAgo(item.updated_at)}
          </span>
          {item.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50">
              <MessageSquare className="w-2.5 h-2.5" />
              {item.comments}
            </span>
          )}
          {item.labels
            .filter((l) => l.name)
            .slice(0, 2)
            .map((label) => (
              <span
                key={label.name}
                className="text-[9px] font-mono px-1 rounded-sm"
                style={{
                  color: `#${label.color || "888"}`,
                  backgroundColor: `#${label.color || "888"}14`,
                }}
              >
                {label.name}
              </span>
            ))}
        </div>
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

/* ── RepoRow ───────────────────────────────────────────────────────── */

function RepoRow({ repo }: { repo: RepoItem }) {
  return (
    <Link
      href={`/repos/${repo.full_name}`}
      className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-zinc-100 dark:border-zinc-800/40 last:border-b-0"
    >
      <Image
        src={repo.owner.avatar_url}
        alt={repo.owner.login}
        width={20}
        height={20}
        className="rounded-sm shrink-0 mt-0.5 w-5 h-5 object-cover"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono truncate group-hover:text-foreground transition-colors">
            <span className="text-muted-foreground/50">{repo.owner.login}</span>
            <span className="text-muted-foreground/30 mx-0.5">/</span>
            <span className="font-medium">{repo.name}</span>
          </span>
          {repo.private && (
            <Lock className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
          {repo.language && (
            <span className="flex items-center gap-1 font-mono">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: langColor[repo.language] || "#8b949e" }}
              />
              {repo.language}
            </span>
          )}
          {repo.stargazers_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5" />
              {formatNumber(repo.stargazers_count)}
            </span>
          )}
          {repo.updated_at && (
            <span className="ml-auto text-muted-foreground/50 font-mono">
              {timeAgo(repo.updated_at)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── TrendingRow ──────────────────────────────────────────────────── */

function TrendingRow({ repo }: { repo: TrendingRepoItem }) {
  return (
    <Link
      href={`/repos/${repo.full_name}`}
      className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-zinc-100 dark:border-zinc-800/40 last:border-b-0"
    >
      <Image
        src={repo.owner.avatar_url}
        alt={repo.owner.login}
        width={20}
        height={20}
        className="rounded-sm shrink-0 mt-0.5 w-5 h-5 object-cover"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono truncate group-hover:text-foreground transition-colors">
            <span className="text-muted-foreground/50">{repo.owner.login}</span>
            <span className="text-muted-foreground/30 mx-0.5">/</span>
            <span className="font-medium">{repo.name}</span>
          </span>
        </div>
        {repo.description && (
          <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 leading-relaxed">
            {repo.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
          {repo.language && (
            <span className="flex items-center gap-1 font-mono">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: langColor[repo.language] || "#8b949e" }}
              />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5" />
            {formatNumber(repo.stargazers_count)}
          </span>
          {repo.forks_count > 0 && (
            <span className="flex items-center gap-0.5">
              <GitFork className="w-2.5 h-2.5" />
              {formatNumber(repo.forks_count)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── ActivityRow ───────────────────────────────────────────────────── */

function getEventInfo(event: ActivityEvent): { icon: React.ReactNode; text: string } | null {
  const repo = event.repo.name;
  switch (event.type) {
    case "PushEvent": {
      const count = event.payload.size || event.payload.commits?.length || 0;
      const msg = event.payload.commits?.[0]?.message?.split("\n")[0];
      return {
        icon: <GitCommit className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: msg
          ? `${msg}${count > 1 ? ` (+${count - 1} more)` : ""}`
          : `Pushed ${count} commit${count !== 1 ? "s" : ""} to ${repo}`,
      };
    }
    case "PullRequestEvent": {
      const pr = event.payload.pull_request;
      const action = event.payload.action === "closed" && pr?.merged ? "merged" : event.payload.action;
      return {
        icon: <GitPullRequest className={cn("w-3.5 h-3.5", action === "merged" ? "text-purple-500" : action === "opened" ? "text-emerald-500" : "text-muted-foreground/60")} />,
        text: `${action} PR #${pr?.number}: ${pr?.title}`,
      };
    }
    case "IssuesEvent": {
      const issue = event.payload.issue;
      return {
        icon: <CircleDot className={cn("w-3.5 h-3.5", event.payload.action === "opened" ? "text-emerald-500" : "text-muted-foreground/60")} />,
        text: `${event.payload.action} issue #${issue?.number}: ${issue?.title}`,
      };
    }
    case "IssueCommentEvent":
      return {
        icon: <MessageCircle className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: `Commented on #${event.payload.issue?.number}: ${event.payload.issue?.title}`,
      };
    case "CreateEvent":
      return {
        icon: <Plus className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: event.payload.ref
          ? `Created ${event.payload.ref_type} ${event.payload.ref}`
          : `Created ${event.payload.ref_type || "repository"} ${repo}`,
      };
    case "DeleteEvent":
      return {
        icon: <Trash2 className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: `Deleted ${event.payload.ref_type} ${event.payload.ref}`,
      };
    case "WatchEvent":
      return {
        icon: <Star className="w-3.5 h-3.5 text-amber-500/70" />,
        text: `Starred ${repo}`,
      };
    case "ForkEvent":
      return {
        icon: <GitFork className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: `Forked ${repo}`,
      };
    case "PullRequestReviewEvent":
      return {
        icon: <Eye className="w-3.5 h-3.5 text-muted-foreground/60" />,
        text: `Reviewed PR #${event.payload.pull_request?.number}: ${event.payload.pull_request?.title}`,
      };
    default:
      return null;
  }
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const info = getEventInfo(event);
  if (!info) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/40 last:border-b-0">
      <span className="mt-0.5 shrink-0">{info.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate">{info.text}</p>
        <div className="flex items-center gap-2 mt-px">
          <span className="text-[11px] font-mono text-muted-foreground/70 truncate">
            {event.repo.name}
          </span>
          {event.created_at && (
            <span className="text-[11px] text-muted-foreground/50 shrink-0">
              {timeAgo(event.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Greeting ──────────────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
