import Link from "next/link";
import Image from "next/image";
import {
  GitPullRequest,
  GitMerge,
  XCircle,
  GitBranch,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "@/components/shared/copy-link-button";
import { RefreshButton } from "@/components/shared/refresh-button";

interface PRHeaderProps {
  title: string;
  number: number;
  state: string;
  merged: boolean;
  draft: boolean;
  author: { login: string; avatar_url: string } | null;
  createdAt: string;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: Array<{ name?: string; color?: string }>;
  reviewStatuses?: Array<{ login: string; avatar_url: string; state: string }>;
  actions?: React.ReactNode;
  owner: string;
  repo: string;
}

export function PRHeader({
  title,
  number,
  state,
  merged,
  draft,
  author,
  createdAt,
  baseBranch,
  headBranch,
  additions,
  deletions,
  changedFiles,
  labels,
  reviewStatuses,
  actions,
  owner,
  repo,
}: PRHeaderProps) {
  const statusConfig = merged
    ? {
        dot: "bg-purple-500",
        text: "text-purple-600 dark:text-purple-400",
        icon: GitMerge,
        label: "Merged",
      }
    : state === "open"
      ? draft
        ? {
            dot: "bg-zinc-400",
            text: "text-muted-foreground",
            icon: GitPullRequest,
            label: "Draft",
          }
        : {
            dot: "bg-emerald-500",
            text: "text-emerald-600 dark:text-emerald-400",
            icon: GitPullRequest,
            label: "Open",
          }
      : {
          dot: "bg-red-500",
          text: "text-red-600 dark:text-red-400",
          icon: XCircle,
          label: "Closed",
        };

  const StatusIcon = statusConfig.icon;

  return (
    <div className="pb-3 mb-0">
      {/* Title + actions */}
      <div className="flex items-start gap-3 mb-2.5">
        <h1 className="text-base font-medium tracking-tight leading-snug flex-1 min-w-0">
          {title}{" "}
          <span className="text-muted-foreground/50 font-normal">#{number}</span>
        </h1>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Status */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider",
            statusConfig.text
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusConfig.dot)} />
          {statusConfig.label}
        </span>

        {/* Author */}
        {author && (
          <Link
            href={`/users/${author.login}`}
            className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            <Image
              src={author.avatar_url}
              alt={author.login}
              width={16}
              height={16}
              className="rounded-full"
            />
            <span className="font-mono text-[11px]">{author.login}</span>
          </Link>
        )}

        <span className="text-muted-foreground/50 text-[10px]">
          {timeAgo(createdAt)}
        </span>

        {/* Separator */}
        <span className="w-px h-3 bg-zinc-200/80 dark:bg-zinc-800/80" />

        {/* Branch */}
        <span className="flex items-center gap-1 font-mono text-muted-foreground/60 text-[10px]">
          <GitBranch className="w-3 h-3" />
          <span className="text-foreground/70">{headBranch}</span>
          <ArrowLeft className="w-2.5 h-2.5 text-muted-foreground/40" />
          <span>{baseBranch}</span>
        </span>

        {/* Separator */}
        <span className="w-px h-3 bg-zinc-200/80 dark:bg-zinc-800/80" />

        {/* Stats */}
        <span className="flex items-center gap-1.5 font-mono text-[10px]">
          <span className="text-emerald-500">+{additions}</span>
          <span className="text-red-400">-{deletions}</span>
          <span className="text-muted-foreground/60">
            {changedFiles} file{changedFiles !== 1 ? "s" : ""}
          </span>
        </span>

        <CopyLinkButton owner={owner} repo={repo} number={number} type="pulls" />
        <RefreshButton />

        {/* Labels */}
        {labels
          .filter((l) => l.name)
          .slice(0, 3)
          .map((label) => (
            <span
              key={label.name}
              className="text-[9px] font-mono px-1.5 py-0.5 border rounded-sm"
              style={{
                borderColor: `#${label.color || "888"}30`,
                color: `#${label.color || "888"}`,
              }}
            >
              {label.name}
            </span>
          ))}

        {/* Review statuses */}
        {reviewStatuses && reviewStatuses.length > 0 && (
          <>
            <span className="w-px h-3 bg-zinc-200/80 dark:bg-zinc-800/80" />
            {reviewStatuses.map((r) => (
              <Link
                key={r.login}
                href={`/users/${r.login}`}
                className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                title={`${r.login} ${r.state === "APPROVED" ? "approved" : "requested changes"}`}
              >
                <span className="relative">
                  <Image
                    src={r.avatar_url}
                    alt={r.login}
                    width={16}
                    height={16}
                    className="rounded-full"
                  />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ring-2 ring-background",
                      r.state === "APPROVED"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    )}
                  >
                    {r.state === "APPROVED" ? (
                      <Check className="w-2 h-2 text-white" />
                    ) : (
                      <X className="w-2 h-2 text-white" />
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
