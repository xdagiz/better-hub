"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { addIssueComment } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import { MarkdownEditor } from "@/components/shared/markdown-editor";

interface IssueCommentFormProps {
  owner: string;
  repo: string;
  issueNumber: number;
  userAvatarUrl?: string;
  participants?: Array<{ login: string; avatar_url: string }>;
}

export function IssueCommentForm({ owner, repo, issueNumber, userAvatarUrl, participants }: IssueCommentFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addIssueComment(owner, repo, issueNumber, body.trim());
      if (res.error) {
        setError(res.error);
      } else {
        setBody("");
        router.refresh();
      }
    });
  };

  return (
    <div className="border border-zinc-200/60 dark:border-zinc-800/50 rounded-md overflow-hidden">
      <div className="px-3.5 py-2 border-b border-zinc-200/60 dark:border-zinc-800/40 bg-zinc-50/50 dark:bg-zinc-800/20">
        <div className="flex items-center gap-2">
          {userAvatarUrl && (
            <Image
              src={userAvatarUrl}
              alt=""
              width={16}
              height={16}
              className="rounded-full shrink-0"
            />
          )}
          <span className="text-xs font-medium text-muted-foreground/60">
            Add a comment
          </span>
        </div>
      </div>
      <div className="p-2.5">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder="Leave a comment..."
          rows={3}
          participants={participants}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <div>
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
              "border border-border",
              "text-foreground/80 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
              "transition-colors cursor-pointer",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CornerDownLeft className="w-3.5 h-3.5" />
            )}
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
