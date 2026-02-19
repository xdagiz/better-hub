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
  MessageSquare,
  Lock,
  Flame,
  GitCommit,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { toInternalUrl } from "@/lib/github-utils";
import { authClient } from "@/lib/auth-client";
import { RecentlyViewed } from "./recently-viewed";
import { CreateRepoDialog } from "@/components/repo/create-repo-dialog";

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
  slackConnected: boolean;
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
  slackConnected,
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
        <h1 className="text-sm font-medium">
          {greeting}, {user.name || user.login}
        </h1>
        <p className="text-[11px] text-muted-foreground font-mono">
          {today}
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 pb-2">
        {/* Left — overview + work items */}
        <div className="lg:w-1/2 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pr-2">
          {/* Activity marquee */}
          <ActivityMarquee activity={activity} />

          {/* Stats */}
          <div className="shrink-0 grid grid-cols-4 gap-3">
            <Stat icon={<Eye className="w-3.5 h-3.5" />} label="Reviews" value={reviewRequests.total_count} accent={reviewRequests.total_count > 0} />
            <Stat icon={<GitPullRequest className="w-3.5 h-3.5" />} label="Open PRs" value={myOpenPRs.total_count} accent={myOpenPRs.total_count > 0} />
            <Stat icon={<CircleDot className="w-3.5 h-3.5" />} label="Issues" value={myIssues.total_count} accent={myIssues.total_count > 0} />
            <Stat icon={<Bell className="w-3.5 h-3.5" />} label="Notifs" value={notifications.filter((n) => n.unread).length} />
          </div>

          {/* Slack connect card */}
          {!slackConnected && (
            <button
              onClick={() =>
                authClient.linkSocial({
                  provider: "slack",
                  callbackURL: "/dashboard",
                })
              }
              className="shrink-0 flex items-center gap-3 px-4 py-3 border border-dashed border-border/70 hover:border-foreground/20 dark:hover:border-foreground/10 transition-colors group cursor-pointer text-left"
            >
              <svg className="w-4 h-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground/60 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"/>
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  Connect Slack
                </span>
                <span className="text-[11px] text-muted-foreground/50 ml-2">
                  Get PR notifications as DMs
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground/40 group-hover:text-foreground/60 transition-colors">
                Connect →
              </span>
            </button>
          )}

          {/* Tabbed work panel */}
          <WorkTabs
            reviewRequests={reviewRequests}
            myOpenPRs={myOpenPRs}
            myIssues={myIssues}
            hasWork={hasWork}
          />
        </div>

        {/* Right — recently viewed + repos/trending */}
        <div className="lg:w-1/2 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pl-2">
          {/* Recently Viewed */}
          <RecentlyViewed />

          {/* Repos + Trending (tabbed) */}
          <ReposTabs repos={repos} trending={trending} />
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
      <div className="flex-1 min-h-0 border border-border py-12 text-center">
        <CheckCircle2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground font-mono">
          Nothing needs your attention
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-border">
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

/* ── ReposTabs ─────────────────────────────────────────────────────── */

function ReposTabs({
  repos,
  trending,
}: {
  repos: Array<RepoItem>;
  trending: Array<TrendingRepoItem>;
}) {
  const [tab, setTab] = useState<"repos" | "trending">("repos");

  return (
    <section className="flex-1 border border-border flex flex-col min-h-0">
      <div className="shrink-0 flex items-center border-b border-border">
        <button
          onClick={() => setTab("repos")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
            tab === "repos"
              ? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
              : "text-muted-foreground hover:text-foreground/60"
          )}
        >
          Repositories
        </button>
        {trending.length > 0 && (
          <button
            onClick={() => setTab("trending")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
              tab === "trending"
                ? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
                : "text-muted-foreground hover:text-foreground/60"
            )}
          >
            <Flame className="w-3 h-3 text-orange-500/70" />
            Trending
          </button>
        )}
        {tab === "trending" && (
          <Link
            href="/trending"
            className="ml-auto mr-3 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            See all
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
        {tab === "repos" && (
          <div className="ml-auto mr-3">
            <CreateRepoDialog />
          </div>
        )}
      </div>
      <div className="overflow-y-auto">
        {tab === "repos"
          ? repos.slice(0, 10).map((repo) => (
              <RepoRow key={repo.id} repo={repo} />
            ))
          : trending.map((repo) => (
              <TrendingRow key={repo.id} repo={repo} />
            ))}
      </div>
    </section>
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
          : "border-border/70"
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
          <span className="w-1 h-1 rounded-full bg-success/80 animate-pulse" />
        )}
      </div>
    </div>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────── */

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border border-border">
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
      className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/60 last:border-b-0"
    >
      {type === "pr" ? (
        <GitPullRequest
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            isMerged ? "text-alert-important" : isDraft ? "text-muted-foreground" : "text-success"
          )}
        />
      ) : (
        <CircleDot className="w-3.5 h-3.5 text-success shrink-0" />
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
            <TimeAgo date={item.updated_at} />
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
      href={`/${repo.full_name}`}
      className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/60 last:border-b-0"
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
              <TimeAgo date={repo.updated_at} />
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
      href={`/${repo.full_name}`}
      className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/60 last:border-b-0"
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

/* ── ActivityMarquee ───────────────────────────────────────────────── */

function getMarqueeItem(event: ActivityEvent): { icon: React.ReactNode; text: string; href: string; time: string } | null {
  const repoFullName = event.repo?.name;
  if (!repoFullName) return null;
  const repoBase = `/${repoFullName}`;
  const time = event.created_at
    ? new Date(event.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })
    : "";
  const p = (event as any).payload ?? {};

  switch (event.type) {
    case "PushEvent": {
      const msg = p.commits?.[0]?.message?.split("\n")[0];
      const count = p.size ?? p.commits?.length ?? 0;
      return {
        icon: <GitCommit className="w-3 h-3" />,
        text: msg || (count > 1 ? `Pushed ${count} commits to ${repoFullName}` : `Pushed to ${repoFullName}`),
        href: repoBase,
        time,
      };
    }
    case "PullRequestEvent": {
      const pr = p.pull_request;
      if (!pr?.number) return { icon: <GitPullRequest className="w-3 h-3" />, text: `PR activity in ${repoFullName}`, href: repoBase, time };
      const action = p.action === "closed" && pr.merged ? "merged" : (p.action || "updated");
      return {
        icon: <GitPullRequest className={cn("w-3 h-3", action === "merged" ? "text-alert-important" : action === "opened" ? "text-success" : "")} />,
        text: `${action} #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
        href: `${repoBase}/pulls/${pr.number}`,
        time,
      };
    }
    case "PullRequestReviewEvent": {
      const pr = p.pull_request;
      if (!pr?.number) return { icon: <Eye className="w-3 h-3" />, text: `Reviewed PR in ${repoFullName}`, href: repoBase, time };
      return {
        icon: <Eye className="w-3 h-3" />,
        text: `reviewed #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
        href: `${repoBase}/pulls/${pr.number}`,
        time,
      };
    }
    case "PullRequestReviewCommentEvent": {
      const pr = p.pull_request;
      if (!pr?.number) return { icon: <MessageCircle className="w-3 h-3" />, text: `Commented on PR in ${repoFullName}`, href: repoBase, time };
      return {
        icon: <MessageCircle className="w-3 h-3" />,
        text: `commented on review #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
        href: `${repoBase}/pulls/${pr.number}`,
        time,
      };
    }
    case "IssuesEvent": {
      const issue = p.issue;
      if (!issue?.number) return { icon: <CircleDot className="w-3 h-3" />, text: `Issue activity in ${repoFullName}`, href: repoBase, time };
      const action = p.action || "updated";
      return {
        icon: <CircleDot className={cn("w-3 h-3", action === "opened" ? "text-success" : "")} />,
        text: `${action} #${issue.number}${issue.title ? `: ${issue.title}` : ""}`,
        href: `${repoBase}/issues/${issue.number}`,
        time,
      };
    }
    case "IssueCommentEvent": {
      const issue = p.issue;
      if (!issue?.number) return { icon: <MessageCircle className="w-3 h-3" />, text: `Commented in ${repoFullName}`, href: repoBase, time };
      return {
        icon: <MessageCircle className="w-3 h-3" />,
        text: `commented on #${issue.number}${issue.title ? `: ${issue.title}` : ""}`,
        href: `${repoBase}/issues/${issue.number}`,
        time,
      };
    }
    case "CreateEvent":
      return {
        icon: <Plus className="w-3 h-3" />,
        text: p.ref
          ? `created ${p.ref_type || "ref"} ${p.ref}`
          : `created ${p.ref_type || "repo"} ${repoFullName}`,
        href: repoBase,
        time,
      };
    case "DeleteEvent":
      return {
        icon: <Trash2 className="w-3 h-3" />,
        text: `deleted ${p.ref_type || "ref"} ${p.ref || ""}`.trim(),
        href: repoBase,
        time,
      };
    case "WatchEvent":
      return {
        icon: <Star className="w-3 h-3 text-warning" />,
        text: `starred ${repoFullName}`,
        href: repoBase,
        time,
      };
    case "ForkEvent":
      return {
        icon: <GitFork className="w-3 h-3" />,
        text: `forked ${repoFullName}`,
        href: repoBase,
        time,
      };
    case "ReleaseEvent":
      return {
        icon: <Plus className="w-3 h-3" />,
        text: `${p.action || "published"} release ${p.release?.tag_name || ""} in ${repoFullName}`.trim(),
        href: repoBase,
        time,
      };
    case "CommitCommentEvent":
      return {
        icon: <MessageCircle className="w-3 h-3" />,
        text: `commented on commit in ${repoFullName}`,
        href: repoBase,
        time,
      };
    case "GollumEvent":
      return {
        icon: <Plus className="w-3 h-3" />,
        text: `updated wiki in ${repoFullName}`,
        href: repoBase,
        time,
      };
    case "MemberEvent":
      return {
        icon: <Plus className="w-3 h-3" />,
        text: `${p.action || "added"} member ${p.member?.login || ""} to ${repoFullName}`.trim(),
        href: repoBase,
        time,
      };
    case "PublicEvent":
      return {
        icon: <Eye className="w-3 h-3" />,
        text: `made ${repoFullName} public`,
        href: repoBase,
        time,
      };
    default:
      return null;
  }
}

function ActivityMarquee({ activity }: { activity: Array<ActivityEvent> }) {
  const items = activity
    .map((e) => getMarqueeItem(e))
    .filter(Boolean) as Array<{ icon: React.ReactNode; text: string; href: string; time: string }>;

  if (items.length === 0) return null;

  const content = items.map((item, i) => (
    <Link
      key={i}
      href={item.href}
      className="inline-flex items-center gap-1 shrink-0 hover:text-foreground transition-colors"
    >
      <span className="text-muted-foreground/30">{item.time}</span>
      <span className="text-muted-foreground/50">{item.icon}</span>
      <span>{item.text}</span>
      <span className="text-muted-foreground/15 mx-1">&middot;</span>
    </Link>
  ));

  return (
    <div className="shrink-0 overflow-hidden border border-border">
      <div className="flex whitespace-nowrap marquee-track text-[11px] font-mono text-muted-foreground py-2 px-3">
        {content}
        {content}
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
