"use client";

import Image from "next/image";
import Link from "next/link";
import { GitBranch, Clock, GitCommit, ArrowLeft } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { StatusIcon } from "./status-icon";

interface WorkflowRun {
  id: number;
  name: string;
  display_title: string;
  run_number: number;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  event: string;
  run_started_at?: string | null;
  updated_at: string;
  created_at: string;
  actor: { login: string; avatar_url: string } | null;
  html_url: string;
}

interface Step {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: Step[];
}

function conclusionLabel(conclusion: string | null, status: string): string {
  if (status === "in_progress" || status === "queued" || status === "waiting")
    return status.replace("_", " ");
  return conclusion ?? status;
}

export function RunDetail({
  owner,
  repo,
  run,
  jobs,
}: {
  owner: string;
  repo: string;
  run: WorkflowRun;
  jobs: Job[];
}) {
  return (
    <div>
      {/* Back link */}
      <Link
        href={`/${owner}/${repo}/actions`}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-3 h-3" />
        All runs
      </Link>

      {/* Header */}
      <div className="border border-border p-4 mb-4">
        <div className="flex items-start gap-3">
          <StatusIcon
            status={run.status ?? ""}
            conclusion={run.conclusion}
            className="w-5 h-5 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-medium truncate">
              {run.display_title}
            </h1>
            <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">
              {run.name} #{run.run_number}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span
                className={cn(
                  "text-[10px] font-mono uppercase px-2 py-0.5 border",
                  run.conclusion === "success"
                    ? "border-success/30 text-success"
                    : run.conclusion === "failure"
                      ? "border-destructive/30 text-destructive"
                      : "border-border text-muted-foreground"
                )}
              >
                {conclusionLabel(run.conclusion, run.status ?? "")}
              </span>
              {run.head_branch && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  <GitBranch className="w-3 h-3" />
                  {run.head_branch}
                </span>
              )}
              <span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60">
                {run.event}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50">
                <GitCommit className="w-3 h-3" />
                {run.head_sha.slice(0, 7)}
              </span>
              {run.run_started_at && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Clock className="w-3 h-3" />
                  {formatDuration(
                    run.run_started_at,
                    run.status === "completed" ? run.updated_at : null
                  )}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground/40">
                <TimeAgo date={run.updated_at} />
              </span>
            </div>
          </div>
          {run.actor && (
            <Link
              href={`/users/${run.actor.login}`}
              className="flex items-center gap-2 shrink-0 hover:text-foreground transition-colors"
            >
              <Image
                src={run.actor.avatar_url}
                alt={run.actor.login}
                width={24}
                height={24}
                className="rounded-full"
              />
              <span className="text-[11px] font-mono text-muted-foreground">
                {run.actor.login}
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Jobs */}
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
        Jobs
      </h2>
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border border-border"
          >
            {/* Job header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <StatusIcon
                status={job.status}
                conclusion={job.conclusion}
              />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">
                {job.name}
              </span>
              {job.started_at && (
                <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatDuration(job.started_at, job.completed_at)}
                </span>
              )}
            </div>

            {/* Steps */}
            {job.steps && job.steps.length > 0 && (
              <div className="divide-y divide-border/50">
                {job.steps.map((step) => (
                  <div
                    key={step.number}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <StatusIcon
                      status={step.status}
                      conclusion={step.conclusion}
                      className="w-3 h-3"
                    />
                    <span className="text-[11px] font-mono text-muted-foreground/60 w-5 text-right shrink-0">
                      {step.number}
                    </span>
                    <span className="text-xs flex-1 min-w-0 truncate">
                      {step.name}
                    </span>
                    {step.started_at && (
                      <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
                        {formatDuration(step.started_at, step.completed_at)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="py-12 text-center border border-border">
            <p className="text-xs text-muted-foreground font-mono">
              No jobs found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
