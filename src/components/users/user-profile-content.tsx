"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpDown,
  Building2,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FolderGit2,
  GitFork,
  Globe,
  Link2,
  Lock,
  MapPin,
  Search,
  Star,
  Twitter,
  Users,
} from "lucide-react";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { ContributionChart } from "@/components/dashboard/contribution-chart";

export interface UserProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  blog: string | null;
  location: string | null;
  company: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
}

export interface UserRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string | null;
  pushed_at: string | null;
}

export interface UserOrg {
  login: string;
  avatar_url: string;
}

interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface ContributionData {
  totalContributions: number;
  weeks: ContributionWeek[];
}

type FilterType = "all" | "sources" | "forks" | "archived";
type SortType = "updated" | "name" | "stars";

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

function formatJoinedDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserProfileContent({
  user,
  repos,
  orgs,
  contributions,
}: {
  user: UserProfile;
  repos: UserRepo[];
  orgs: UserOrg[];
  contributions: ContributionData | null;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("updated");

  const filtered = useMemo(
    () =>
      repos
        .filter((repo) => {
          if (
            search &&
            ![repo.name, repo.description ?? "", repo.language ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())
          ) {
            return false;
          }
          if (filter === "sources" && repo.fork) return false;
          if (filter === "forks" && !repo.fork) return false;
          if (filter === "archived" && !repo.archived) return false;
          return true;
        })
        .sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          if (sort === "stars") return b.stargazers_count - a.stargazers_count;
          return (
            new Date(b.updated_at || 0).getTime() -
            new Date(a.updated_at || 0).getTime()
          );
        }),
    [repos, search, filter, sort]
  );

  const languages = useMemo(
    () => [...new Set(repos.map((repo) => repo.language).filter(Boolean))],
    [repos]
  );

  const joinedDate = formatJoinedDate(user.created_at);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Profile header */}
      <div className="shrink-0 pb-6 mb-6 border-b border-border">
        <div className="flex items-start gap-5">
          <Image
            src={user.avatar_url}
            alt={user.login}
            width={96}
            height={96}
            className="rounded-full border border-border shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-medium tracking-tight truncate">
                {user.name || user.login}
              </h1>
              <a
                href={user.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
              @{user.login}
            </p>

            {user.bio && (
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                {user.bio}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {user.company && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                  <Building2 className="w-3 h-3" />
                  {user.company}
                </span>
              )}
              {user.location && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                  <MapPin className="w-3 h-3" />
                  {user.location}
                </span>
              )}
              {user.blog && (
                <a
                  href={user.blog.startsWith("http") ? user.blog : `https://${user.blog}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
                >
                  <Link2 className="w-3 h-3" />
                  {user.blog.replace(/^https?:\/\//, "")}
                </a>
              )}
              {user.twitter_username && (
                <a
                  href={`https://twitter.com/${user.twitter_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
                >
                  <Twitter className="w-3 h-3" />
                  @{user.twitter_username}
                </a>
              )}
              {joinedDate && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 font-mono">
                  <CalendarDays className="w-3 h-3" />
                  Joined {joinedDate}
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <FolderGit2 className="w-3 h-3" />
                {formatNumber(user.public_repos)} repos
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Users className="w-3 h-3" />
                {formatNumber(user.followers)} followers
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 font-mono">
                {formatNumber(user.following)} following
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contribution chart */}
      {contributions && (
        <div className="shrink-0 pb-6 mb-6 border-b border-border">
          <ContributionChart data={contributions} />
        </div>
      )}

      {/* Organizations */}
      {orgs.length > 0 && (
        <div className="shrink-0 pb-6 mb-6 border-b border-border">
          <h2 className="text-xs font-mono text-muted-foreground/60 uppercase tracking-wider mb-3">
            Organizations
          </h2>
          <div className="flex items-center -space-x-2">
            {orgs.map((org) => (
              <Link
                key={org.login}
                href={`/orgs/${org.login}`}
                title={org.login}
                className="relative hover:z-10 transition-transform hover:scale-110"
              >
                <Image
                  src={org.avatar_url}
                  alt={org.login}
                  width={32}
                  height={32}
                  className="rounded-md border-2 border-background"
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search & filters */}
      <div className="shrink-0 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Find a repository..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border border-border pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
            />
          </div>

          <div className="flex items-center border border-border divide-x divide-border rounded-md">
            {(
              [
                ["all", "All"],
                ["sources", "Sources"],
                ["forks", "Forks"],
                ["archived", "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
                  filter === value
                    ? "bg-muted/50 dark:bg-white/4 text-foreground"
                    : "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() =>
              setSort((current) =>
                current === "updated" ? "stars" : current === "stars" ? "name" : "updated"
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground border border-border hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer rounded-md"
          >
            <ArrowUpDown className="w-3 h-3" />
            {sort === "updated" ? "Updated" : sort === "stars" ? "Stars" : "Name"}
          </button>

          <span className="text-[11px] text-muted-foreground/40 font-mono ml-auto">
            {filtered.length} of {repos.length}
          </span>
        </div>

        {languages.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {languages.slice(0, 14).map((lang) => (
              <button
                key={lang}
                onClick={() => setSearch(lang || "")}
                className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground border border-border hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer font-mono rounded-md"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: languageColors[lang || ""] || "#8b949e",
                  }}
                />
                {lang}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Repo list */}
      <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {filtered.map((repo) => (
          <Link
            key={repo.id}
            href={`/repos/${repo.full_name}`}
            className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground group-hover:text-foreground transition-colors font-mono">
                  {repo.name}
                </span>
                {repo.private ? (
                  <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 rounded-sm">
                    <Lock className="w-2.5 h-2.5" />
                    Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 rounded-sm">
                    <Globe className="w-2.5 h-2.5" />
                    Public
                  </span>
                )}
                {repo.archived && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 border border-warning/30 text-warning rounded-sm">
                    Archived
                  </span>
                )}
                {repo.fork && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 rounded-sm">
                    Fork
                  </span>
                )}
              </div>

              {repo.description && (
                <p className="text-[11px] text-muted-foreground mt-1 truncate max-w-lg">
                  {repo.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 shrink-0">
              {repo.language && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-mono">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: languageColors[repo.language] || "#8b949e",
                    }}
                  />
                  {repo.language}
                </span>
              )}
              {repo.stargazers_count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <Star className="w-3 h-3" />
                  {formatNumber(repo.stargazers_count)}
                </span>
              )}
              {repo.forks_count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <GitFork className="w-3 h-3" />
                  {formatNumber(repo.forks_count)}
                </span>
              )}
              {repo.updated_at && (
                <span className="text-[11px] text-muted-foreground/50 font-mono w-14 text-right">
                  {timeAgo(repo.updated_at)}
                </span>
              )}
              <ChevronRight className="w-3 h-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <FolderGit2 className="w-6 h-6 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              No repositories found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
