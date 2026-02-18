import Link from "next/link";
import Image from "next/image";
import { CircleDot, CheckCircle2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "@/components/shared/copy-link-button";

interface IssueHeaderProps {
  title: string;
  number: number;
  state: string;
  author: { login: string; avatar_url: string } | null;
  createdAt: string;
  commentsCount: number;
  labels: Array<{ name?: string; color?: string }>;
  owner: string;
  repo: string;
}

export function IssueHeader({
  title,
  number,
  state,
  author,
  createdAt,
  commentsCount,
  labels,
  owner,
  repo,
}: IssueHeaderProps) {
  const isOpen = state === "open";

  return (
    <div className="mb-6">
      <h1 className="text-base font-medium tracking-tight mb-2">
        {title}{" "}
        <span className="text-muted-foreground/50 font-normal">#{number}</span>
      </h1>
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono",
            isOpen
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-purple-600 dark:text-purple-400"
          )}
        >
          {isOpen ? (
            <CircleDot className="w-3 h-3" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          {isOpen ? "Open" : "Closed"}
        </span>
        {author && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link
              href={`/users/${author.login}`}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Image
                src={author.avatar_url}
                alt={author.login}
                width={16}
                height={16}
                className="rounded-full"
              />
              <span className="font-mono">{author.login}</span>
            </Link>
            <span className="text-muted-foreground/50">
              opened {timeAgo(createdAt)}
            </span>
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/50 font-mono">
          {commentsCount} comment{commentsCount !== 1 ? "s" : ""}
        </span>
        <CopyLinkButton owner={owner} repo={repo} number={number} type="issues" />
        {labels
          .filter((l) => l.name)
          .map((label) => (
            <span
              key={label.name}
              className="text-[9px] font-mono px-1.5 py-0.5 border"
              style={{
                borderColor: `#${label.color || "888"}30`,
                color: `#${label.color || "888"}`,
              }}
            >
              {label.name}
            </span>
          ))}
      </div>
    </div>
  );
}
