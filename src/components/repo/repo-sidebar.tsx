import Image from "next/image";
import Link from "next/link";
import {
  Star,
  GitFork,
  Eye,
  Lock,
  Globe,
  ExternalLink,
  GitBranch,
  GitCommit,
  Scale,
  CircleDot,
  Archive,
  Users,
  Link as LinkIcon,
  HardDrive,
} from "lucide-react";
import { formatNumber, timeAgo } from "@/lib/utils";
import { formatBytes } from "@/lib/github-utils";

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
}

interface LatestCommit {
  sha: string;
  message: string;
  date: string;
  author: { login: string; avatarUrl: string } | null;
}

interface RepoSidebarProps {
  owner: string;
  repoName: string;
  ownerType: string;
  avatarUrl: string;
  description: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssuesCount: number;
  isPrivate: boolean;
  defaultBranch: string;
  language: string | null;
  license: { name: string; spdx_id: string | null } | null;
  pushedAt: string;
  size: number;
  htmlUrl: string;
  homepage: string | null;
  topics: string[];
  archived: boolean;
  fork: boolean;
  parent: { fullName: string; owner: string; name: string } | null;
  contributors: Contributor[];
  contributorsTotalCount: number;
  latestCommit: LatestCommit | null;
}

export function RepoSidebar({
  owner,
  repoName,
  ownerType,
  avatarUrl,
  description,
  stars,
  forks,
  watchers,
  openIssuesCount,
  isPrivate,
  defaultBranch,
  language,
  license,
  pushedAt,
  size,
  htmlUrl,
  homepage,
  topics,
  archived,
  fork,
  parent,
  contributors,
  contributorsTotalCount,
  latestCommit,
}: RepoSidebarProps) {
  const badges = [
    isPrivate
      ? { label: "Private", icon: Lock }
      : { label: "Public", icon: Globe },
    ...(archived ? [{ label: "Archived", icon: Archive }] : []),
    ...(fork ? [{ label: "Fork", icon: GitFork }] : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 overflow-y-auto pt-0 px-4 pb-4 flex-col gap-5">
        {/* Avatar + project name */}
        <div className="flex flex-col gap-2">
          <Image
            src={avatarUrl}
            alt=""
            width={160}
            height={160}
            className="w-32 aspect-square rounded-sm border border-border"
          />
          <div className="text-sm font-mono">
            <Link
              href={ownerType === "Organization" ? `/orgs/${owner}` : `/users/${owner}`}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {owner}
            </Link>
            <span className="text-muted-foreground/40 mx-0.5">/</span>
            <span className="font-medium text-foreground">{repoName}</span>
          </div>
        </div>

        {/* Description + Badges */}
        <div className="flex flex-col gap-2">
          {description && (
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b.label}
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground"
              >
                <b.icon className="w-2.5 h-2.5" />
                {b.label}
              </span>
            ))}
          </div>
          {fork && parent && (
            <p className="text-[11px] text-muted-foreground/60">
              Forked from{" "}
              <Link
                href={`/repos/${parent.owner}/${parent.name}`}
                className="text-muted-foreground hover:text-foreground transition-colors font-mono"
              >
                {parent.fullName}
              </Link>
            </p>
          )}
        </div>

        {/* Latest commit */}
        {latestCommit && (
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
              <GitCommit className="w-3 h-3" />
              Latest commit
            </span>
            <Link
              href={`/repos/${owner}/${repoName}/commits`}
              className="group flex items-start gap-2 p-2 -mx-2 rounded-md hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              {latestCommit.author?.avatarUrl ? (
                <Image
                  src={latestCommit.author.avatarUrl}
                  alt={latestCommit.author.login}
                  width={20}
                  height={20}
                  className="rounded-full shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground/80 group-hover:text-foreground truncate transition-colors">
                  {latestCommit.message.split("\n")[0]}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    {latestCommit.author?.login ?? "unknown"}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {timeAgo(latestCommit.date)}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Topics */}
        {topics.length > 0 && (
          <div className="relative">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="text-[10px] font-mono px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800/60 text-muted-foreground rounded-full shrink-0"
                >
                  {topic}
                </span>
              ))}
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-background to-transparent" />
          </div>
        )}

        {/* Stats */}
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Stats
          </span>
          <div className="flex flex-col gap-1.5">
            {[
              { icon: Star, label: "Stars", value: formatNumber(stars) },
              { icon: GitFork, label: "Forks", value: formatNumber(forks) },
              {
                icon: Eye,
                label: "Watchers",
                value: formatNumber(watchers),
              },
              {
                icon: CircleDot,
                label: "Issues",
                value: formatNumber(openIssuesCount),
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-1.5 text-muted-foreground/70">
                  <stat.icon className="w-3 h-3" />
                  {stat.label}
                </span>
                <span className="font-mono text-muted-foreground">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open on GitHub
          </a>
          <a
            href={`${htmlUrl}/fork`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <GitFork className="w-3 h-3" />
            Fork
          </a>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Info
          </span>
          <div className="flex flex-col gap-1.5">
            {language && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground/70">Language</span>
                <span className="font-mono text-muted-foreground">
                  {language}
                </span>
              </div>
            )}
            {license && (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground/70">
                  <Scale className="w-3 h-3" />
                  License
                </span>
                <span className="font-mono text-muted-foreground">
                  {license.spdx_id ?? license.name}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground/70">
                <GitBranch className="w-3 h-3" />
                Branch
              </span>
              <span className="font-mono text-muted-foreground">
                {defaultBranch}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70">Last push</span>
              <span className="font-mono text-muted-foreground">
                {timeAgo(pushedAt)}
              </span>
            </div>
            {size > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground/70">
                  <HardDrive className="w-3 h-3" />
                  Size
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatBytes(size * 1024)}
                </span>
              </div>
            )}
            {homepage && (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground/70">
                  <LinkIcon className="w-3 h-3" />
                  Homepage
                </span>
                <a
                  href={homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]"
                >
                  {homepage.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Contributors */}
        {contributors.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
              <span className="flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Contributors
                <span className="text-muted-foreground/70">{contributorsTotalCount}</span>
              </span>
            </span>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {contributors.map((c, i) => (
                  <a
                    key={c.login}
                    href={`/users/${c.login}`}
                    title={`${c.login} (${c.contributions})`}
                    className="relative hover:z-10 hover:-translate-y-0.5 transition-transform"
                    style={{ zIndex: contributors.length - i }}
                  >
                    <Image
                      src={c.avatar_url}
                      alt={c.login}
                      width={26}
                      height={26}
                      className="rounded-full border-2 border-background ring-1 ring-border"
                    />
                  </a>
                ))}
              </div>
              {contributorsTotalCount > contributors.length && (
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  +{contributorsTotalCount - contributors.length}
                </span>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile compact header */}
      <div className="block lg:hidden px-4">
        <div className="mb-2">
          {description && (
            <p className="text-xs text-muted-foreground/80 mb-1.5 max-w-2xl">
              {description}
            </p>
          )}
          <div className="flex items-center gap-4">
            {badges.map((b) => (
              <span
                key={b.label}
                className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground"
              >
                <b.icon className="w-2.5 h-2.5" />
                {b.label}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <Star className="w-3 h-3" />
              {formatNumber(stars)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <GitFork className="w-3 h-3" />
              {formatNumber(forks)}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <Eye className="w-3 h-3" />
              {formatNumber(watchers)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
