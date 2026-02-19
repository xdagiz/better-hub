"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Play,
  GitBranch,
  Clock,
  ChevronDown,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { StatusIcon } from "./status-icon";

interface Workflow {
  id: number;
  name: string;
  state: string;
}

interface WorkflowRun {
  id: number;
  name: string;
  display_title: string;
  run_number: number;
  status: string | null;
  conclusion: string | null;
  workflow_id: number;
  head_branch: string | null;
  event: string;
  run_started_at?: string | null;
  updated_at: string;
  created_at: string;
  actor: { login: string; avatar_url: string } | null;
}

type StatusFilter = "all" | "success" | "failure" | "in_progress";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "in_progress", label: "In progress" },
];

export function ActionsList({
  owner,
  repo,
  workflows,
  runs,
}: {
  owner: string;
  repo: string;
  workflows: Workflow[];
  runs: WorkflowRun[];
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workflowFilter, setWorkflowFilter] = useState<number | null>(null);
  const [workflowDropdownOpen, setWorkflowDropdownOpen] = useState(false);

  const workflowRuns = workflowFilter
    ? runs.filter((run) => run.workflow_id === workflowFilter)
    : runs;

  function countForStatus(status: StatusFilter): number {
    if (status === "all") return workflowRuns.length;
    if (status === "in_progress")
      return workflowRuns.filter(
        (r) => r.status === "in_progress" || r.status === "queued" || r.status === "waiting"
      ).length;
    return workflowRuns.filter((r) => r.conclusion === status).length;
  }

  const filteredRuns = workflowRuns.filter((run) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "in_progress")
      return run.status === "in_progress" || run.status === "queued" || run.status === "waiting";
    return run.conclusion === statusFilter;
  });

  const selectedWorkflow = workflows.find((w) => w.id === workflowFilter);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Workflow dropdown */}
        <div className="relative">
          <button
            onClick={() => setWorkflowDropdownOpen(!workflowDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {selectedWorkflow?.name ?? "All workflows"}
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>
          {workflowDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setWorkflowDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 z-20 min-w-[200px] border border-border bg-background shadow-lg">
                <button
                  onClick={() => {
                    setWorkflowFilter(null);
                    setWorkflowDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-muted/50 transition-colors cursor-pointer",
                    !workflowFilter && "text-foreground font-medium"
                  )}
                >
                  All workflows
                </button>
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => {
                      setWorkflowFilter(wf.id);
                      setWorkflowDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-muted/50 transition-colors cursor-pointer",
                      workflowFilter === wf.id &&
                        "text-foreground font-medium"
                    )}
                  >
                    {wf.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-0 border-b border-border mb-4">
        {STATUS_TABS.map((tab) => {
          const count = countForStatus(tab.value);
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors cursor-pointer",
                statusFilter === tab.value
                  ? "border-b-foreground/50 text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground/60"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.5 border",
                  statusFilter === tab.value
                    ? "border-border text-foreground/60"
                    : "border-border text-muted-foreground/50"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Runs list */}
      <div className="border border-border divide-y divide-border">
        {filteredRuns.map((run) => {
          const workflowName =
            workflows.find((w) => w.id === run.workflow_id)?.name ?? run.name;
          return (
            <Link
              key={run.id}
              href={`/${owner}/${repo}/actions/${run.id}`}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
            >
              <StatusIcon
                status={run.status ?? ""}
                conclusion={run.conclusion}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate group-hover:text-foreground transition-colors">
                    {run.display_title}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    {workflowName}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground/50">
                    #{run.run_number}
                  </span>
                  {run.head_branch && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                      <GitBranch className="w-3 h-3" />
                      {run.head_branch}
                    </span>
                  )}
                  <span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60">
                    {run.event}
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
                <Image
                  src={run.actor.avatar_url}
                  alt={run.actor.login}
                  width={20}
                  height={20}
                  className="rounded-full shrink-0"
                />
              )}
            </Link>
          );
        })}

        {filteredRuns.length === 0 && (
          <div className="py-16 text-center">
            <Play className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-mono">
              No workflow runs found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
