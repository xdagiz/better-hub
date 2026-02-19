import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getOctokitFromSession, getGitHubToken } from "@/lib/ai-auth";
import type { Octokit } from "@octokit/rest";
import { Sandbox } from "@vercel/sandbox";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { embedText } from "@/lib/mixedbread";
import { rerankResults } from "@/lib/mixedbread";
import { searchEmbeddings, type ContentType } from "@/lib/embedding-store";
import { toAppUrl } from "@/lib/github-utils";
import { getUserSettings } from "@/lib/user-settings-store";
import {
  createPromptRequest as createPromptRequestInDb,
  updatePromptRequestStatus,
  updatePromptRequestContent,
  getPromptRequest as getPromptRequestFromDb,
} from "@/lib/prompt-request-store";
import {
  invalidateIssueCache,
  invalidatePullRequestCache,
  invalidateRepoIssuesCache,
  invalidateRepoPullRequestsCache,
} from "@/lib/github";

export const maxDuration = 300;

// ─── Safe tool wrapper ──────────────────────────────────────────────────────
// Wraps all tool execute functions with try/catch so a single tool failure
// (e.g. GitHub 403, rate limit, network error) doesn't crash the entire stream.
function withSafeTools(tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!t || typeof t !== "object") { wrapped[name] = t; continue; }
    const origExecute = t.execute;
    if (typeof origExecute !== "function") { wrapped[name] = t; continue; }
    wrapped[name] = {
      ...t,
      execute: async (...args: any[]) => {
        try {
          return await origExecute(...args);
        } catch (e: any) {
          console.error(`[Ghost] tool "${name}" error:`, e.message);
          return { error: e.message || `Tool "${name}" failed` };
        }
      },
    };
  }
  return wrapped;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PRContext {
  owner: string;
  repo: string;
  pullNumber: number;
  prTitle: string;
  prBody: string;
  baseBranch: string;
  headBranch: string;
  files: { filename: string; patch: string }[];
}

interface IssueContext {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
  body: string | null;
  state: string;
  labels: string[];
  comments: { author: string; body: string; createdAt: string }[];
}

interface InlineContext {
  filename: string;
  startLine: number;
  endLine: number;
  selectedCode: string;
  side: "LEFT" | "RIGHT";
}

interface PageContext {
  pathname?: string;
}

// ─── Tool Factories ─────────────────────────────────────────────────────────

function getGeneralTools(octokit: Octokit, pageContext?: PageContext, userId?: string) {
  return {
    searchRepos: tool({
      description:
        "Search GitHub repositories by query. Use for 'find repos about X', 'search for Y library', etc.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        language: z
          .string()
          .optional()
          .describe("Filter by programming language"),
        sort: z
          .enum(["stars", "updated", "best-match"])
          .optional()
          .describe("Sort order"),
      }),
      execute: async ({ query, language, sort }) => {
        const q = language ? `${query} language:${language}` : query;
        const { data } = await octokit.search.repos({
          q,
          sort: sort === "best-match" ? undefined : sort,
          order: "desc",
          per_page: 10,
        });
        return {
          total_count: data.total_count,
          repos: data.items.map((r) => ({
            full_name: r.full_name,
            description: r.description,
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
            language: r.language,
            updated_at: r.updated_at,
            owner_avatar: r.owner?.avatar_url,
          })),
        };
      },
    }),

    searchUsers: tool({
      description: "Search GitHub users by username or name.",
      inputSchema: z.object({
        query: z.string().describe("Search query for username or name"),
      }),
      execute: async ({ query }) => {
        const { data } = await octokit.search.users({
          q: query,
          per_page: 10,
        });
        return {
          total_count: data.total_count,
          users: data.items.map((u) => ({
            login: u.login,
            avatar_url: u.avatar_url,
            type: u.type,
            html_url: toAppUrl(u.html_url),
          })),
        };
      },
    }),

    getRepoInfo: tool({
      description: "Get detailed information about a specific repository.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        const { data } = await octokit.repos.get({ owner, repo });
        return {
          full_name: data.full_name,
          description: data.description,
          stargazers_count: data.stargazers_count,
          forks_count: data.forks_count,
          open_issues_count: data.open_issues_count,
          language: data.language,
          default_branch: data.default_branch,
          created_at: data.created_at,
          updated_at: data.updated_at,
          license: (data.license as any)?.spdx_id || null,
          topics: data.topics,
          private: data.private,
          fork: data.fork,
          archived: data.archived,
          watchers_count: data.watchers_count,
          owner_avatar: data.owner?.avatar_url,
        };
      },
    }),

    starRepo: tool({
      description:
        "Star a repository. Use when the user says 'star this repo' or 'star owner/repo'.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        await octokit.activity.starRepoForAuthenticatedUser({ owner, repo });
        return { success: true, action: "starred", repo: `${owner}/${repo}` };
      },
    }),

    unstarRepo: tool({
      description: "Unstar a repository.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        await octokit.activity.unstarRepoForAuthenticatedUser({ owner, repo });
        return {
          success: true,
          action: "unstarred",
          repo: `${owner}/${repo}`,
        };
      },
    }),

    forkRepo: tool({
      description:
        "Fork a repository to the authenticated user's account.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        const { data } = await octokit.repos.createFork({ owner, repo });
        return {
          success: true,
          action: "forked",
          full_name: data.full_name,
          html_url: toAppUrl(data.html_url),
        };
      },
    }),

    watchRepo: tool({
      description: "Watch/subscribe to a repository for notifications.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        await octokit.activity.setRepoSubscription({
          owner,
          repo,
          subscribed: true,
        });
        return {
          success: true,
          action: "watching",
          repo: `${owner}/${repo}`,
        };
      },
    }),

    unwatchRepo: tool({
      description: "Stop watching a repository.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async ({ owner, repo }) => {
        await octokit.activity.deleteRepoSubscription({ owner, repo });
        return {
          success: true,
          action: "unwatched",
          repo: `${owner}/${repo}`,
        };
      },
    }),

    createIssue: tool({
      description:
        "Create a new issue on a repository. Ask for title and body if not provided.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().optional().describe("Issue body/description"),
        labels: z
          .array(z.string())
          .optional()
          .describe("Labels to add"),
      }),
      execute: async ({ owner, repo, title, body, labels }) => {
        const { data } = await octokit.issues.create({
          owner,
          repo,
          title,
          body,
          labels,
        });
        return {
          success: true,
          number: data.number,
          title: data.title,
          html_url: toAppUrl(data.html_url),
          repo: `${owner}/${repo}`,
        };
      },
    }),

    closeIssue: tool({
      description: "Close an issue. Only call after confirmation.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number to close"),
      }),
      execute: async ({ owner, repo, issueNumber }) => {
        const { data } = await octokit.issues.update({
          owner,
          repo,
          issue_number: issueNumber,
          state: "closed",
        });
        return {
          success: true,
          action: "closed",
          number: data.number,
          title: data.title,
        };
      },
    }),

    listIssues: tool({
      description: "List issues for a repository.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Issue state filter"),
        labels: z.string().optional().describe("Comma-separated label names"),
      }),
      execute: async ({ owner, repo, state, labels }) => {
        const { data } = await octokit.issues.listForRepo({
          owner,
          repo,
          state: state || "open",
          labels,
          per_page: 15,
          sort: "updated",
          direction: "desc",
        });
        return {
          issues: data
            .filter((i) => !i.pull_request)
            .map((i) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              user: i.user?.login,
              labels: i.labels.map((l) =>
                typeof l === "string" ? l : l.name
              ),
              created_at: i.created_at,
              comments: i.comments,
            })),
        };
      },
    }),

    listPullRequests: tool({
      description: "List pull requests for a repository.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("PR state filter"),
      }),
      execute: async ({ owner, repo, state }) => {
        const { data } = await octokit.pulls.list({
          owner,
          repo,
          state: state || "open",
          per_page: 15,
          sort: "updated",
          direction: "desc",
        });
        return {
          pull_requests: data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            user: pr.user?.login,
            created_at: pr.created_at,
            draft: pr.draft,
            head: pr.head.ref,
            base: pr.base.ref,
          })),
        };
      },
    }),

    mergePullRequest: tool({
      description:
        "Merge a pull request. Ask for confirmation before merging.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("PR number to merge"),
        mergeMethod: z
          .enum(["merge", "squash", "rebase"])
          .optional()
          .describe("Merge method"),
      }),
      execute: async ({ owner, repo, pullNumber, mergeMethod }) => {
        const { data } = await octokit.pulls.merge({
          owner,
          repo,
          pull_number: pullNumber,
          merge_method: mergeMethod || "merge",
        });
        return {
          _clientAction: "refreshPage" as const,
          success: data.merged,
          message: data.message,
          sha: data.sha,
        };
      },
    }),

    getUserProfile: tool({
      description: "Get a GitHub user's profile information.",
      inputSchema: z.object({
        username: z.string().describe("GitHub username"),
      }),
      execute: async ({ username }) => {
        const { data } = await octokit.users.getByUsername({ username });
        return {
          login: data.login,
          name: data.name,
          bio: data.bio,
          avatar_url: data.avatar_url,
          html_url: toAppUrl(data.html_url),
          public_repos: data.public_repos,
          followers: data.followers,
          following: data.following,
          company: data.company,
          location: data.location,
          blog: data.blog,
          created_at: data.created_at,
        };
      },
    }),

    followUser: tool({
      description: "Follow a GitHub user.",
      inputSchema: z.object({
        username: z.string().describe("GitHub username to follow"),
      }),
      execute: async ({ username }) => {
        await octokit.users.follow({ username });
        return { success: true, action: "followed", username };
      },
    }),

    unfollowUser: tool({
      description: "Unfollow a GitHub user.",
      inputSchema: z.object({
        username: z.string().describe("GitHub username to unfollow"),
      }),
      execute: async ({ username }) => {
        await octokit.users.unfollow({ username });
        return { success: true, action: "unfollowed", username };
      },
    }),

    listNotifications: tool({
      description: "List the user's unread GitHub notifications.",
      inputSchema: z.object({
        all: z
          .boolean()
          .optional()
          .describe("If true, show all notifications (not just unread)"),
      }),
      execute: async ({ all }) => {
        const { data } =
          await octokit.activity.listNotificationsForAuthenticatedUser({
            all: all || false,
            per_page: 15,
          });
        return {
          notifications: data.map((n) => ({
            id: n.id,
            reason: n.reason,
            subject_title: n.subject.title,
            subject_type: n.subject.type,
            repo: n.repository.full_name,
            updated_at: n.updated_at,
            unread: n.unread,
          })),
        };
      },
    }),

    markNotificationsRead: tool({
      description: "Mark all notifications as read.",
      inputSchema: z.object({}),
      execute: async () => {
        await octokit.activity.markNotificationsAsRead();
        return { success: true, action: "marked_all_read" };
      },
    }),

    createGist: tool({
      description:
        "Create a GitHub Gist. Useful for quickly sharing code snippets.",
      inputSchema: z.object({
        description: z.string().optional().describe("Gist description"),
        filename: z.string().describe("Filename for the gist"),
        content: z.string().describe("File content"),
        public: z
          .boolean()
          .optional()
          .describe("Whether the gist is public (default: false)"),
      }),
      execute: async ({
        description,
        filename,
        content,
        public: isPublic,
      }) => {
        const { data } = await octokit.gists.create({
          description: description || "",
          public: isPublic || false,
          files: { [filename]: { content } },
        });
        return {
          success: true,
          html_url: data.html_url ? toAppUrl(data.html_url) : data.html_url,
          id: data.id,
        };
      },
    }),

    refreshPage: tool({
      description:
        "Refresh the current page to reflect changes. Call this AFTER any mutation that affects the current UI — e.g. after starring a repo while on that repo's page, after closing an issue while viewing it, after merging a PR, after commenting, after adding labels, etc. Only call once at the end of your response, not after every tool call.",
      inputSchema: z.object({}),
      execute: async () => {
        // Invalidate local caches so router.refresh() picks up fresh data
        const path = pageContext?.pathname || "";
        const issueMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
        const prMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/);
        const issueListMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/?$/);
        const prListMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/?$/);

        if (issueMatch) {
          const [, owner, repo, num] = issueMatch;
          await invalidateIssueCache(owner, repo, parseInt(num, 10));
        } else if (prMatch) {
          const [, owner, repo, num] = prMatch;
          await invalidatePullRequestCache(owner, repo, parseInt(num, 10));
        } else if (issueListMatch) {
          const [, owner, repo] = issueListMatch;
          await invalidateRepoIssuesCache(owner, repo);
        } else if (prListMatch) {
          const [, owner, repo] = prListMatch;
          await invalidateRepoPullRequestsCache(owner, repo);
        }

        return {
          _clientAction: "refreshPage" as const,
          success: true,
        };
      },
    }),

    navigateTo: tool({
      description:
        "Navigate the user to a top-level page within the app. Use when they say 'go to repos', 'show me PRs', 'show trending', etc.",
      inputSchema: z.object({
        page: z
          .enum([
            "dashboard",
            "repos",
            "prs",
            "issues",
            "notifications",
            "settings",
            "search",
            "trending",
            "orgs",
          ])
          .describe("Target page"),
        description: z
          .string()
          .describe("Brief description, e.g. 'Opening repositories page'"),
      }),
      execute: async (input) => ({
        _clientAction: "navigate" as const,
        ...input,
      }),
    }),

    openRepo: tool({
      description: "Navigate to a specific repository within the app.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
      }),
      execute: async (input) => ({
        _clientAction: "openRepo" as const,
        ...input,
      }),
    }),

    openRepoTab: tool({
      description:
        "Navigate to a specific tab/section of a repository within the app. Use when the user says 'show me actions', 'show commits', 'who contributes', 'show security', 'repo settings', etc.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        tab: z
          .enum(["actions", "commits", "issues", "pulls", "people", "security", "settings"])
          .describe("The repo tab to navigate to"),
      }),
      execute: async (input) => ({
        _clientAction: "openRepoTab" as const,
        ...input,
      }),
    }),

    openWorkflowRun: tool({
      description:
        "Navigate to a specific workflow run (GitHub Action) within the app. Use when the user says 'show me run #123', 'open that action', etc.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        runId: z.number().describe("Workflow run ID"),
      }),
      execute: async (input) => ({
        _clientAction: "openWorkflowRun" as const,
        ...input,
      }),
    }),

    openCommit: tool({
      description:
        "Navigate to a specific commit within the app. Use when the user says 'show me commit abc123', 'open that commit', etc.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        sha: z.string().describe("Commit SHA"),
      }),
      execute: async (input) => ({
        _clientAction: "openCommit" as const,
        ...input,
      }),
    }),

    openIssue: tool({
      description:
        "Navigate to a specific issue within the app. Use when the user says 'open issue #5', 'go to that issue', 'show me issue 123', etc.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number"),
      }),
      execute: async (input) => ({
        _clientAction: "openIssue" as const,
        ...input,
      }),
    }),

    openPullRequest: tool({
      description:
        "Navigate to a specific pull request within the app. Use when the user says 'open PR #10', 'go to that PR', 'show me pull request 42', etc.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("Pull request number"),
      }),
      execute: async (input) => ({
        _clientAction: "openPullRequest" as const,
        ...input,
      }),
    }),

    openUser: tool({
      description:
        "Navigate to a user's profile page within the app. Use when the user says 'show me user X', 'go to their profile', 'who is X', etc.",
      inputSchema: z.object({
        username: z.string().describe("GitHub username"),
      }),
      execute: async (input) => ({
        _clientAction: "openUser" as const,
        ...input,
      }),
    }),

    openUrl: tool({
      description:
        "Open an external URL in a new browser tab. Only use for URLs that DON'T have an in-app equivalent. For repos, issues, PRs, actions, commits, users — always use the specific navigation tools instead.",
      inputSchema: z.object({
        url: z.string().describe("URL to open"),
        description: z.string().describe("What this link is"),
      }),
      execute: async (input) => ({
        _clientAction: "openUrl" as const,
        ...input,
      }),
    }),

    // ── Flexible read-only GitHub API query ──────────────────────────────

    queryGitHub: tool({
      description: `Make any read-only GET request to the GitHub REST API. Use this when the user asks something that your other tools can't answer — e.g. "list branches", "show releases", "who reviewed PR #5", "show workflow runs", "list collaborators", "get commit history", etc.

The endpoint uses GitHub's REST route syntax: "GET /repos/{owner}/{repo}/branches", "GET /repos/{owner}/{repo}/releases", "GET /users/{username}/repos", etc.

Path parameters like {owner} should be filled in the params object. Query parameters (per_page, state, sort, etc.) also go in params.

Only GET requests are allowed. For mutations use the dedicated tools.`,
      inputSchema: z.object({
        endpoint: z
          .string()
          .describe(
            'GitHub REST API route, e.g. "GET /repos/{owner}/{repo}/branches"'
          ),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe(
            "Path and query parameters, e.g. { owner: 'vercel', repo: 'next.js', per_page: 10 }"
          ),
      }),
      execute: async ({ endpoint, params }) => {
        // Enforce read-only
        if (!endpoint.startsWith("GET ")) {
          return {
            error:
              "Only GET requests are allowed. Use dedicated tools for mutations.",
          };
        }
        try {
          const response = await octokit.request(endpoint, {
            ...(params || {}),
            per_page: (params?.per_page as number) || 20,
          });
          // Truncate large arrays to avoid overwhelming context
          const data = response.data;
          if (Array.isArray(data) && data.length > 30) {
            return {
              total_returned: data.length,
              items: data.slice(0, 30),
              truncated: true,
            };
          }
          return data;
        } catch (e: any) {
          return {
            error: e.message || "GitHub API request failed",
            status: e.status || null,
          };
        }
      },
    }),

    // ── Comment tools ────────────────────────────────────────────────────

    commentOnIssue: tool({
      description:
        "Add a comment to a GitHub issue. Use when the user wants to comment on an issue.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number"),
        body: z.string().describe("Comment body (markdown supported)"),
      }),
      execute: async ({ owner, repo, issueNumber, body }) => {
        const { data } = await octokit.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body,
        });
        return {
          success: true,
          id: data.id,
          html_url: toAppUrl(data.html_url),
        };
      },
    }),

    commentOnPR: tool({
      description:
        "Add a comment to a pull request (as a general comment, not an inline review comment).",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("PR number"),
        body: z.string().describe("Comment body (markdown supported)"),
      }),
      execute: async ({ owner, repo, pullNumber, body }) => {
        // PR comments use the issues API
        const { data } = await octokit.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body,
        });
        return {
          success: true,
          id: data.id,
          html_url: toAppUrl(data.html_url),
        };
      },
    }),

    // ── Label tools ──────────────────────────────────────────────────────

    addLabels: tool({
      description: "Add labels to an issue or pull request.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z
          .number()
          .describe("Issue or PR number"),
        labels: z
          .array(z.string())
          .describe("Label names to add"),
      }),
      execute: async ({ owner, repo, issueNumber, labels }) => {
        const { data } = await octokit.issues.addLabels({
          owner,
          repo,
          issue_number: issueNumber,
          labels,
        });
        return {
          success: true,
          labels: data.map((l) => l.name),
        };
      },
    }),

    removeLabels: tool({
      description: "Remove a label from an issue or pull request.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z
          .number()
          .describe("Issue or PR number"),
        label: z.string().describe("Label name to remove"),
      }),
      execute: async ({ owner, repo, issueNumber, label }) => {
        try {
          await octokit.issues.removeLabel({
            owner,
            repo,
            issue_number: issueNumber,
            name: label,
          });
          return { success: true, removed: label };
        } catch (e: any) {
          return { error: e.message || "Failed to remove label" };
        }
      },
    }),

    // ── PR review tools ──────────────────────────────────────────────────

    requestReviewers: tool({
      description:
        "Request reviewers for a pull request. Ask for confirmation if not sure who to request.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("PR number"),
        reviewers: z
          .array(z.string())
          .describe("GitHub usernames to request review from"),
      }),
      execute: async ({ owner, repo, pullNumber, reviewers }) => {
        const { data } = await octokit.pulls.requestReviewers({
          owner,
          repo,
          pull_number: pullNumber,
          reviewers,
        });
        return {
          success: true,
          requested_reviewers: (data.requested_reviewers || []).map(
            (r: any) => r.login
          ),
        };
      },
    }),

    // ── Branch tool ──────────────────────────────────────────────────────

    createBranch: tool({
      description:
        "Create a new branch from an existing ref (branch name or SHA).",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        branchName: z.string().describe("New branch name"),
        fromRef: z
          .string()
          .describe(
            "Source branch name or commit SHA to branch from"
          ),
      }),
      execute: async ({ owner, repo, branchName, fromRef }) => {
        try {
          // Resolve the SHA
          let sha = fromRef;
          if (!/^[0-9a-f]{40}$/i.test(fromRef)) {
            const { data } = await octokit.git.getRef({
              owner,
              repo,
              ref: `heads/${fromRef}`,
            });
            sha = data.object.sha;
          }
          await octokit.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branchName}`,
            sha,
          });
          return {
            success: true,
            branch: branchName,
            from: fromRef,
            sha,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to create branch" };
        }
      },
    }),

    // ── Assign tools ─────────────────────────────────────────────────────

    assignIssue: tool({
      description: "Assign users to an issue or pull request.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue or PR number"),
        assignees: z
          .array(z.string())
          .describe("GitHub usernames to assign"),
      }),
      execute: async ({ owner, repo, issueNumber, assignees }) => {
        const { data } = await octokit.issues.addAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees,
        });
        return {
          success: true,
          assignees: (data.assignees || []).map((a: any) => a.login),
        };
      },
    }),

    unassignIssue: tool({
      description: "Remove assignees from an issue or pull request.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue or PR number"),
        assignees: z
          .array(z.string())
          .describe("GitHub usernames to unassign"),
      }),
      execute: async ({ owner, repo, issueNumber, assignees }) => {
        const { data } = await octokit.issues.removeAssignees({
          owner,
          repo,
          issue_number: issueNumber,
          assignees,
        });
        return {
          success: true,
          remaining_assignees: (data.assignees || []).map(
            (a: any) => a.login
          ),
        };
      },
    }),

    createPromptRequest: tool({
      description:
        "Create a prompt request for a repository. Use when the user wants to capture an idea, feature request, bug fix, or refactor as a prompt request. Summarize the conversation into clear, actionable instructions in the body.",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Short descriptive title for the prompt request"),
        body: z
          .string()
          .describe(
            "Detailed instructions for the changes. Be specific about what files to change, what logic to add, etc."
          ),
      }),
      execute: async ({ owner, repo, title, body }) => {
        if (!userId) return { error: "Not authenticated" };
        const pr = createPromptRequestInDb(userId, owner, repo, title, body);
        return {
          _clientAction: "openPromptRequests" as const,
          success: true,
          id: pr.id,
          title: pr.title,
          owner,
          repo,
          url: `/${owner}/${repo}/prompts/${pr.id}`,
        };
      },
    }),

    completePromptRequest: tool({
      description:
        "Mark a prompt request as completed after creating a PR for it. Use after sandboxCreatePR or createPullRequest when processing a prompt request.",
      inputSchema: z.object({
        promptRequestId: z.string().describe("The prompt request ID to mark as completed"),
        prNumber: z.number().describe("The PR number that was created"),
      }),
      execute: async ({ promptRequestId, prNumber }) => {
        updatePromptRequestStatus(promptRequestId, "completed", { prNumber });
        return {
          _clientAction: "refreshPage" as const,
          success: true,
          promptRequestId,
          prNumber,
        };
      },
    }),

    editPromptRequest: tool({
      description:
        "Edit an existing prompt request's title and/or body. Use when the user asks to update, refine, or change a prompt request they are currently viewing.",
      inputSchema: z.object({
        promptRequestId: z.string().describe("The prompt request ID to edit"),
        title: z.string().optional().describe("New title (omit to keep current)"),
        body: z.string().optional().describe("New body/instructions (omit to keep current)"),
      }),
      execute: async ({ promptRequestId, title, body }) => {
        const existing = getPromptRequestFromDb(promptRequestId);
        if (!existing) return { error: "Prompt request not found" };
        if (existing.status !== "open") return { error: "Can only edit open prompt requests" };

        const updated = updatePromptRequestContent(promptRequestId, {
          ...(title !== undefined ? { title } : {}),
          ...(body !== undefined ? { body } : {}),
        });

        return {
          _clientAction: "refreshPage" as const,
          success: true,
          promptRequestId,
          title: updated?.title,
        };
      },
    }),
  };
}

function getPrTools(octokit: Octokit, prContext: PRContext) {
  return {
    getFileContent: tool({
      description:
        "Read the full contents of a file from the PR's head branch. Use this before editing a file to get its current state.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
      }),
      execute: async ({ path }) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner: prContext.owner,
            repo: prContext.repo,
            path,
            ref: prContext.headBranch,
          });
          if (Array.isArray(data) || data.type !== "file") {
            return { error: "Not a file" };
          }
          const content = Buffer.from(
            (data as any).content,
            "base64"
          ).toString("utf-8");
          return { path, content };
        } catch (e: any) {
          return { error: e.message || "Failed to read file" };
        }
      },
    }),

    editFile: tool({
      description:
        "Edit an existing file on the PR branch and commit the change. Always read the file first with getFileContent.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
        content: z.string().describe("The complete new file content"),
        commitMessage: z
          .string()
          .describe(
            "A clear, concise commit message describing the change"
          ),
      }),
      execute: async ({ path, content, commitMessage }) => {
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner: prContext.owner,
            repo: prContext.repo,
            path,
            ref: prContext.headBranch,
          });
          if (Array.isArray(fileData) || fileData.type !== "file") {
            return { error: "Not a file" };
          }

          await octokit.repos.createOrUpdateFileContents({
            owner: prContext.owner,
            repo: prContext.repo,
            path,
            message: commitMessage,
            content: Buffer.from(content).toString("base64"),
            sha: (fileData as any).sha,
            branch: prContext.headBranch,
          });

          return {
            success: true,
            path,
            branch: prContext.headBranch,
            commitMessage,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to edit file" };
        }
      },
    }),

    createFile: tool({
      description: "Create a new file on the PR branch and commit it.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
        content: z.string().describe("The file content"),
        commitMessage: z
          .string()
          .describe("A clear, concise commit message"),
      }),
      execute: async ({ path, content, commitMessage }) => {
        try {
          await octokit.repos.createOrUpdateFileContents({
            owner: prContext.owner,
            repo: prContext.repo,
            path,
            message: commitMessage,
            content: Buffer.from(content).toString("base64"),
            branch: prContext.headBranch,
          });

          return {
            success: true,
            path,
            branch: prContext.headBranch,
            commitMessage,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to create file" };
        }
      },
    }),

    amendCommit: tool({
      description:
        "Amend the last commit on the PR branch. Replaces the most recent commit with updated file changes while keeping the same parent. Use this when you want to add more changes to the previous commit instead of creating a new one — for example, fixing a typo in a file you just edited, or adding a forgotten file to the last commit.",
      inputSchema: z.object({
        files: z
          .array(
            z.object({
              path: z.string().describe("File path relative to repo root"),
              content: z
                .string()
                .describe("The complete new file content"),
            })
          )
          .describe("Files to include in the amended commit"),
        commitMessage: z
          .string()
          .optional()
          .describe(
            "New commit message. If omitted, keeps the original message."
          ),
      }),
      execute: async ({ files, commitMessage }) => {
        try {
          const o = prContext.owner;
          const r = prContext.repo;
          const branch = prContext.headBranch;

          // 1. Get the latest commit on the branch
          const { data: refData } = await octokit.git.getRef({
            owner: o,
            repo: r,
            ref: `heads/${branch}`,
          });
          const lastCommitSha = refData.object.sha;

          // 2. Get the commit to find its parent and message
          const { data: lastCommit } = await octokit.git.getCommit({
            owner: o,
            repo: r,
            commit_sha: lastCommitSha,
          });
          const parentSha = lastCommit.parents[0]?.sha;
          if (!parentSha) {
            return { error: "Cannot amend: no parent commit found" };
          }
          const originalMessage = lastCommit.message;
          const baseTreeSha = lastCommit.tree.sha;

          // 3. Create blobs for each file
          const treeItems = await Promise.all(
            files.map(async (file) => {
              const { data: blob } = await octokit.git.createBlob({
                owner: o,
                repo: r,
                content: Buffer.from(file.content).toString("base64"),
                encoding: "base64",
              });
              return {
                path: file.path,
                mode: "100644" as const,
                type: "blob" as const,
                sha: blob.sha,
              };
            })
          );

          // 4. Create a new tree based on the last commit's tree
          const { data: newTree } = await octokit.git.createTree({
            owner: o,
            repo: r,
            base_tree: baseTreeSha,
            tree: treeItems,
          });

          // 5. Create a new commit with the same parent (replacing the old one)
          const { data: newCommit } = await octokit.git.createCommit({
            owner: o,
            repo: r,
            message: commitMessage || originalMessage,
            tree: newTree.sha,
            parents: [parentSha],
          });

          // 6. Force-update the branch to point to the new commit
          await octokit.git.updateRef({
            owner: o,
            repo: r,
            ref: `heads/${branch}`,
            sha: newCommit.sha,
            force: true,
          });

          return {
            success: true,
            branch,
            commitMessage: commitMessage || originalMessage,
            amendedSha: lastCommitSha.slice(0, 7),
            newSha: newCommit.sha.slice(0, 7),
            filesChanged: files.map((f) => f.path),
          };
        } catch (e: any) {
          return { error: e.message || "Failed to amend commit" };
        }
      },
    }),
  };
}

function getIssueTools(
  octokit: Octokit,
  issueContext: IssueContext,
  defaultBranch: string
) {
  let workingBranch: string | null = null;
  const branchName = `fix/issue-${issueContext.issueNumber}`;

  return {
    getFileContent: tool({
      description:
        "Read the full contents of a file from the repository's default branch. Use this before editing a file to understand its current state.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
      }),
      execute: async ({ path }) => {
        try {
          const { data } = await octokit.repos.getContent({
            owner: issueContext.owner,
            repo: issueContext.repo,
            path,
            ref: workingBranch || defaultBranch,
          });
          if (Array.isArray(data) || data.type !== "file") {
            return { error: "Not a file" };
          }
          const content = Buffer.from(
            (data as any).content,
            "base64"
          ).toString("utf-8");
          return { path, content };
        } catch (e: any) {
          return { error: e.message || "Failed to read file" };
        }
      },
    }),

    editFile: tool({
      description:
        "Edit an existing file and commit the change. Creates a new branch on first edit. Always read the file first with getFileContent.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
        content: z.string().describe("The complete new file content"),
        commitMessage: z
          .string()
          .describe(
            "A clear, concise commit message describing the change"
          ),
      }),
      execute: async ({ path, content, commitMessage }) => {
        try {
          if (!workingBranch) {
            const { data: refData } = await octokit.git.getRef({
              owner: issueContext.owner,
              repo: issueContext.repo,
              ref: `heads/${defaultBranch}`,
            });
            try {
              await octokit.git.createRef({
                owner: issueContext.owner,
                repo: issueContext.repo,
                ref: `refs/heads/${branchName}`,
                sha: refData.object.sha,
              });
            } catch (e: any) {
              if (e.status !== 422) throw e;
            }
            workingBranch = branchName;
          }

          const { data: fileData } = await octokit.repos.getContent({
            owner: issueContext.owner,
            repo: issueContext.repo,
            path,
            ref: workingBranch,
          });
          if (Array.isArray(fileData) || fileData.type !== "file") {
            return { error: "Not a file" };
          }

          await octokit.repos.createOrUpdateFileContents({
            owner: issueContext.owner,
            repo: issueContext.repo,
            path,
            message: commitMessage,
            content: Buffer.from(content).toString("base64"),
            sha: (fileData as any).sha,
            branch: workingBranch,
          });

          return {
            success: true,
            path,
            branch: workingBranch,
            commitMessage,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to edit file" };
        }
      },
    }),

    createFile: tool({
      description:
        "Create a new file and commit it. Creates a new branch on first edit.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
        content: z.string().describe("The file content"),
        commitMessage: z
          .string()
          .describe("A clear, concise commit message"),
      }),
      execute: async ({ path, content, commitMessage }) => {
        try {
          if (!workingBranch) {
            const { data: refData } = await octokit.git.getRef({
              owner: issueContext.owner,
              repo: issueContext.repo,
              ref: `heads/${defaultBranch}`,
            });
            try {
              await octokit.git.createRef({
                owner: issueContext.owner,
                repo: issueContext.repo,
                ref: `refs/heads/${branchName}`,
                sha: refData.object.sha,
              });
            } catch (e: any) {
              if (e.status !== 422) throw e;
            }
            workingBranch = branchName;
          }

          await octokit.repos.createOrUpdateFileContents({
            owner: issueContext.owner,
            repo: issueContext.repo,
            path,
            message: commitMessage,
            content: Buffer.from(content).toString("base64"),
            branch: workingBranch,
          });

          return {
            success: true,
            path,
            branch: workingBranch,
            commitMessage,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to create file" };
        }
      },
    }),

    createPullRequest: tool({
      description:
        "Create a pull request from the working branch to fix this issue. Only use after making edits with editFile/createFile.",
      inputSchema: z.object({
        title: z.string().describe("PR title"),
        body: z.string().describe("PR description body"),
      }),
      execute: async ({ title, body }) => {
        try {
          if (!workingBranch) {
            return {
              error:
                "No changes have been made yet. Use editFile or createFile first.",
            };
          }

          const prBody = `${body}\n\nFixes #${issueContext.issueNumber}`;

          const { data } = await octokit.pulls.create({
            owner: issueContext.owner,
            repo: issueContext.repo,
            title,
            body: prBody,
            head: workingBranch,
            base: defaultBranch,
          });

          return {
            _clientAction: "openPullRequest" as const,
            success: true,
            number: data.number,
            title: data.title,
            html_url: toAppUrl(data.html_url),
            branch: workingBranch,
            owner: issueContext.owner,
            repo: issueContext.repo,
            pullNumber: data.number,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to create pull request" };
        }
      },
    }),
  };
}

// ─── Semantic Search Tool ────────────────────────────────────────────────────

function getSemanticSearchTool(userId: string) {
  return {
    semanticSearch: tool({
      description: `ALWAYS use this tool FIRST when the user asks to find, list, or search for PRs/issues/comments by topic, keyword, or description (e.g. "find PRs about X", "list issues related to Y", "search for Z"). This performs semantic search across all content the user has previously viewed. Only fall back to GitHub API search tools if this returns no results.`,
      inputSchema: z.object({
        query: z.string().describe("Natural language search query"),
        owner: z
          .string()
          .optional()
          .describe("Filter by repository owner"),
        repo: z
          .string()
          .optional()
          .describe("Filter by repository name"),
        contentTypes: z
          .array(
            z.enum([
              "pr",
              "issue",
              "pr_comment",
              "issue_comment",
              "review",
            ])
          )
          .optional()
          .describe("Filter by content type"),
        topK: z
          .number()
          .optional()
          .describe("Number of results to return (default 10)"),
      }),
      execute: async ({ query, owner, repo, contentTypes, topK }) => {
        try {
          // 1. Embed the query
          const queryEmbedding = await embedText(query);

          // 2. Cosine similarity search (top 30 candidates)
          const candidates = searchEmbeddings(userId, queryEmbedding, {
            owner,
            repo,
            topK: 30,
            contentTypes: contentTypes as ContentType[] | undefined,
          });

          if (candidates.length === 0) {
            return {
              results: [],
              message:
                "No previously viewed content found. The user needs to view PRs/issues first for them to be searchable.",
            };
          }

          // 3. Rerank via Mixedbread
          const reranked = await rerankResults(
            query,
            candidates.map((c) => ({
              id: c.contentKey,
              text: `${c.title ?? ""}\n${c.snippet}`,
            })),
            topK ?? 10
          );

          // 4. Map reranked results back to candidates
          const rerankedMap = new Map(
            reranked.map((r) => [r.id, r.score])
          );
          const results = candidates
            .filter((c) => rerankedMap.has(c.contentKey))
            .map((c) => ({
              contentType: c.contentType,
              contentKey: c.contentKey,
              owner: c.owner,
              repo: c.repo,
              itemNumber: c.itemNumber,
              title: c.title,
              snippet: c.snippet,
              score: rerankedMap.get(c.contentKey)!,
            }))
            .sort((a, b) => b.score - a.score);

          return { results };
        } catch (e: any) {
          return { error: e.message || "Semantic search failed" };
        }
      },
    }),
  };
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function buildInlineContextBlock(inlineContexts?: InlineContext[]): string {
  if (!inlineContexts || inlineContexts.length === 0) return "";

  const blocks = inlineContexts
    .map((ctx) => {
      const lineLabel = ctx.startLine === ctx.endLine
        ? `line ${ctx.startLine}`
        : `lines ${ctx.startLine}\u2013${ctx.endLine}`;
      const sideLabel = ctx.side === "LEFT" ? "old/removed version" : "new/current version";
      // Use diff language hint if the code contains diff markers
      const hasDiffMarkers = /^[+-] /m.test(ctx.selectedCode);
      const lang = hasDiffMarkers ? "diff" : "";
      return `### File: \`${ctx.filename}\` | ${lineLabel} (${sideLabel})\n\`\`\`${lang}\n${ctx.selectedCode}\n\`\`\``;
    })
    .join("\n\n");

  return `

## USER-SELECTED CODE (HIGHEST PRIORITY)
**The user has explicitly selected the following code snippet(s) from the diff. When they say "this line", "this code", "this", "what does this do", etc., they are ALWAYS referring to this exact code below.** Answer about this code directly — do not ask them to clarify which line or which file.

${blocks}

Reference the exact file name and line numbers shown above in your response. The line numbers correspond to the file's line numbers. If you need to see more of the file for full context, use the getFileContent tool.`;
}

// ─── System Prompts ─────────────────────────────────────────────────────────

function buildPrSystemPrompt(
  prContext: PRContext,
  inlineContexts?: InlineContext[],
  activeFile?: string,
  sandboxPrompt?: string
) {
  // Determine which files need full diffs (active file + files in inline contexts)
  const priorityFiles = new Set<string>();
  if (activeFile) priorityFiles.add(activeFile);
  if (inlineContexts) {
    for (const ctx of inlineContexts) priorityFiles.add(ctx.filename);
  }

  // Budget: keep total diff content under ~50K chars (~12K tokens) to leave room
  const MAX_DIFF_CHARS = 50_000;
  let diffCharsUsed = 0;

  // 1. Build full diffs for priority files first
  const priorityDiffs: string[] = [];
  const otherFiles: { filename: string; patchLen: number }[] = [];

  for (const f of prContext.files) {
    if (priorityFiles.has(f.filename) && f.patch) {
      priorityDiffs.push(`### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``);
      diffCharsUsed += f.patch.length;
    } else {
      otherFiles.push({ filename: f.filename, patchLen: f.patch?.length ?? 0 });
    }
  }

  // 2. Include other file diffs if they fit within the budget
  const includedOtherDiffs: string[] = [];
  const listedOnlyFiles: string[] = [];

  for (const f of otherFiles) {
    const file = prContext.files.find((pf) => pf.filename === f.filename);
    if (file?.patch && diffCharsUsed + file.patch.length < MAX_DIFF_CHARS) {
      includedOtherDiffs.push(`### ${file.filename}\n\`\`\`diff\n${file.patch}\n\`\`\``);
      diffCharsUsed += file.patch.length;
    } else {
      listedOnlyFiles.push(f.filename);
    }
  }

  // 3. Assemble the changed files section
  const allDiffs = [...priorityDiffs, ...includedOtherDiffs].join("\n\n");
  const fileListSection = listedOnlyFiles.length > 0
    ? `\n\n### Other Changed Files (${listedOnlyFiles.length} files — use getFileContent to read)\n${listedOnlyFiles.map((f) => `- \`${f}\``).join("\n")}`
    : "";

  const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

  const activeFilePrompt = activeFile ? `\n\n## Currently Viewing\nThe user is currently viewing the file: \`${activeFile}\` in the diff viewer.\nIf no specific code snippet is attached below, then "this file" or "this" refers to this file.` : "";

  return `You are Ghost, an AI assistant built into a GitHub client app. You are currently helping with a pull request.

## Pull Request Context
**Repository:** ${prContext.owner}/${prContext.repo}
**PR #${prContext.pullNumber}:** ${prContext.prTitle}
**Branches:** ${prContext.headBranch} \u2192 ${prContext.baseBranch}
**Files changed:** ${prContext.files.length}

### Description
${prContext.prBody || "(No description provided)"}
${activeFilePrompt}${inlineContextPrompt}

### Changed Files
${allDiffs || "(No file changes available)"}${fileListSection}

## Instructions
- Be concise and specific. Reference file names and line numbers when discussing code.
- Use markdown formatting for code snippets and emphasis.
- When suggesting improvements, show the specific code change.
- If asked about something not in the PR context, say so clearly.
- If the user has attached a code snippet above, ALWAYS answer about that specific code. Never say you don't know which line they mean.
- If you need to see a file that's listed but not shown above, use the **getFileContent** tool.
- **NEVER stop mid-task.** If you need multiple tool calls to fulfill a request, keep going until you're done. Always provide a complete final response.
- **IMPORTANT:** When linking to repos, PRs, issues, or users, ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}\`), NEVER use github.com URLs.

## PR Tools
You have tools to directly modify files on the PR branch (\`${prContext.headBranch}\`):
- **getFileContent**: Read the full contents of a file. Use this before editing to get the current state (diffs only show hunks, not full files). **Also use this to read files whose diffs were omitted above for space.**
- **editFile**: Edit an existing file and commit the change. Always read the file first with getFileContent.
- **createFile**: Create a new file and commit it.
- **amendCommit**: Amend the last commit on the branch. Use this to add more changes to the previous commit instead of creating a new one — e.g., fixing a follow-up typo or adding a forgotten file. Accepts multiple files at once.

When asked to make changes:
1. First use getFileContent to read the current file
2. Then use editFile with the complete new file content
3. Write a clear, concise commit message
4. If the user asks to amend, fix up, or add to the last commit, use amendCommit instead of editFile

Only use tools when the user explicitly asks you to make changes or commit something. For reviews and suggestions, just describe the changes in text.

**For complex git operations** (cherry-pick, rebase, merge with conflicts, revert, bisect, squash, etc.), use the **sandbox tools** — startSandbox to clone the repo, then sandboxRun to execute git commands. NEVER say you can't do these operations.

## General Tools
You also have general GitHub tools (search repos, star, fork, list issues/PRs, navigate, comment, labels, assign, request reviewers, create branches, etc.). Use them when the user asks for things beyond this PR.

**IMPORTANT:** After any mutation that affects the current page (commenting, adding labels, requesting reviewers, merging, closing, etc.), ALWAYS call **refreshPage** at the end so the UI updates.

## queryGitHub (Flexible API)
For any read-only query not covered by a specific tool, use queryGitHub to make arbitrary GET requests to the GitHub REST API. Examples:
- "GET /repos/{owner}/{repo}/branches" with { owner, repo }
- "GET /repos/{owner}/{repo}/releases" with { owner, repo, per_page: 5 }
- "GET /repos/{owner}/{repo}/commits" with { owner, repo, per_page: 10 }
- "GET /repos/{owner}/{repo}/contributors" with { owner, repo }
This is very powerful — use it to answer almost any question about repos, users, orgs, etc.

## Semantic Search (USE FIRST)
**IMPORTANT:** When the user asks to find, list, or search for PRs/issues by topic or description (e.g. "find PRs about X", "list all PRs regarding Y", "any issues related to Z"), ALWAYS call **semanticSearch** FIRST before trying GitHub API tools. semanticSearch does natural language search across all content the user has previously viewed — it understands meaning, not just keywords. Only fall back to GitHub search/list tools if semanticSearch returns empty results.

${sandboxPrompt || ""}`;
}

function buildIssueSystemPrompt(
  issueContext: IssueContext,
  defaultBranch: string,
  inlineContexts?: InlineContext[],
  sandboxPrompt?: string
) {
  const branchName = `fix/issue-${issueContext.issueNumber}`;
  const commentsFormatted = issueContext.comments
    .map((c) => `**@${c.author}** (${c.createdAt}):\n${c.body}`)
    .join("\n\n---\n\n");

  const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

  return `You are Ghost, an AI assistant built into a GitHub client app. You are currently helping with a GitHub issue.

## Issue Context
**Repository:** ${issueContext.owner}/${issueContext.repo}
**Issue #${issueContext.issueNumber}:** ${issueContext.title}
**State:** ${issueContext.state}
**Labels:** ${issueContext.labels.length > 0 ? issueContext.labels.join(", ") : "(none)"}

### Description
${issueContext.body || "(No description provided)"}
${inlineContextPrompt}

${commentsFormatted ? `### Comments\n${commentsFormatted}` : ""}

## Instructions
- Be concise and specific. Reference file names and line numbers when discussing code.
- Use markdown formatting for code snippets and emphasis.
- When suggesting fixes, show the specific code change.
- If asked about something not in the issue context, say so clearly.
- If the user has attached a code snippet above, ALWAYS answer about that specific code. Never say you don't know which line they mean.
- **NEVER stop mid-task.** If you need multiple tool calls to fulfill a request, keep going until you're done. Always provide a complete final response.
- **IMPORTANT:** When linking to repos, PRs, issues, or users, ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}\`), NEVER use github.com URLs.

## Issue Tools
You have tools to read and modify files in the repository:
- **getFileContent**: Read the full contents of a file from the default branch (\`${defaultBranch}\`).
- **editFile**: Edit an existing file. Creates a branch \`${branchName}\` on first edit, then commits to it.
- **createFile**: Create a new file. Same branch strategy as editFile.
- **createPullRequest**: Create a PR from the working branch to fix this issue.

When asked to make changes or fix the issue:
1. First use getFileContent to read relevant files
2. Use editFile/createFile to make changes (automatically creates a branch)
3. Use createPullRequest to open a PR that references this issue

Only use tools when the user explicitly asks you to make changes, fix something, or create a PR. For analysis and suggestions, just describe the changes in text.

**For complex git operations** (cherry-pick, rebase, merge with conflicts, revert, bisect, squash, etc.), use the **sandbox tools** — startSandbox to clone the repo, then sandboxRun to execute git commands. NEVER say you can't do these operations.

## General Tools
You also have general GitHub tools (search repos, star, fork, list issues/PRs, navigate, comment, labels, assign, create branches, etc.). Use them when the user asks for things beyond this issue.

**IMPORTANT:** After any mutation that affects the current page (commenting, adding labels, closing, assigning, etc.), ALWAYS call **refreshPage** at the end so the UI updates.

## queryGitHub (Flexible API)
For any read-only query not covered by a specific tool, use queryGitHub to make arbitrary GET requests to the GitHub REST API. This lets you answer almost any question about repos, users, orgs, branches, releases, commits, etc.

## Semantic Search (USE FIRST)
**IMPORTANT:** When the user asks to find, list, or search for PRs/issues by topic or description, ALWAYS call **semanticSearch** FIRST. It does natural language search across previously viewed content. Only fall back to GitHub API tools if semanticSearch returns empty results.

${sandboxPrompt || ""}`;
}

function buildGeneralSystemPrompt(
  currentUser: { login: string } | null,
  pageContext?: PageContext,
  inlineContexts?: InlineContext[],
  sandboxPrompt?: string
) {
  let pageContextPrompt = "";
  if (pageContext?.pathname) {
    pageContextPrompt = `\n\n## Current Page Context
**Current URL:** ${pageContext.pathname}
Use this context to understand what the user might be referring to.`;
  }

  const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

  return `You are Ghost, an AI assistant built into a GitHub client app. You help users perform GitHub actions and navigate the app through natural language.

${currentUser ? `Authenticated GitHub user: ${currentUser.login}` : ""}
${inlineContextPrompt}

## Instructions
- Be concise and helpful. Keep responses short unless the user asks for detail.
- Use markdown formatting.
- Tool results are automatically rendered as rich UI components. Do NOT repeat tool output as text/markdown — just add brief commentary.
- **NEVER stop mid-task.** If you need multiple tool calls to answer a question, keep calling tools until you have everything you need, then give a complete response. Always finish what you started.
- If the user has attached a code snippet above, ALWAYS answer about that specific code.
- **IMPORTANT:** When linking to repos, PRs, issues, or users, ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}/pulls/{number}\`), NEVER use github.com URLs. Use the route patterns: \`/repos/{owner}/{repo}\` for repos, \`/repos/{owner}/{repo}/pulls/{number}\` for PRs, \`/repos/{owner}/{repo}/issues/{number}\` for issues, \`/users/{username}\` for users.

## Action Rules
- For destructive actions (delete repo, close issue), ask for confirmation first.
- For star/unstar/fork, proceed directly \u2014 these are low-risk.
- When creating issues or PRs, ask for details if not provided (title, body).
- **ALWAYS call refreshPage** after any mutation that affects the current page (star, comment, close issue, merge PR, add labels, etc.). Call it once at the end, after all mutations are done.
- **ALWAYS navigate within the app** — never send users to github.com when there's an in-app page.
- **NEVER say you can't perform git operations.** You have a cloud sandbox (startSandbox → sandboxRun) that gives you a full Linux VM with git. Use it for cherry-pick, rebase, merge, revert, bisect, conflict resolution, or ANY git operation. Just spin up the sandbox and do it.
- Use navigateTo for top-level pages: dashboard, repos, prs, issues, notifications, settings, search, trending, orgs.
- Use openRepo to navigate to a specific repository.
- Use openRepoTab to navigate to a repo section: actions, commits, issues, pulls, people, security, settings.
- Use openWorkflowRun to navigate to a specific workflow run / GitHub Action.
- Use openCommit to navigate to a specific commit.
- Use openIssue to navigate to a specific issue.
- Use openPullRequest to navigate to a specific pull request.
- Use openUser to navigate to a user's profile page.
- Only use openUrl for truly external URLs with no in-app equivalent.

## Available Navigation
- **Top-level pages:** dashboard, repos, prs, issues, notifications, settings, search, trending, orgs
- **Repo sections:** openRepoTab — actions, commits, issues, pulls, people, security, settings
- **Specific items:** openRepo, openWorkflowRun, openCommit, openIssue, openPullRequest, openUser

## queryGitHub (Flexible API)
You have a powerful queryGitHub tool that can make any read-only GET request to the GitHub REST API. Use it when the user asks about things your specific tools don't cover — branches, releases, commits, contributors, workflow runs, repo stats, org members, etc.

Examples:
- "GET /repos/{owner}/{repo}/branches" with { owner, repo }
- "GET /repos/{owner}/{repo}/releases" with { owner, repo, per_page: 5 }
- "GET /repos/{owner}/{repo}/actions/runs" with { owner, repo, per_page: 5 }
- "GET /orgs/{org}/members" with { org }
- "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews" with { owner, repo, pull_number }

You also have tools for: commenting on issues/PRs, adding/removing labels, assigning users, requesting PR reviewers, and creating branches.

## Prompt Requests
- Use \`createPromptRequest\` when the user says "open a prompt request", "create a prompt request", or similar. Summarize the conversation into clear, actionable instructions in the body field.
- Use \`editPromptRequest\` when the user asks to update, refine, or change a prompt request. If the user is currently viewing a prompt request page (URL contains \`/prompts/<id>\`), extract the prompt request ID from the URL and use it. Update the title and/or body as requested.
- Use \`completePromptRequest\` after creating a PR that fulfills a prompt request. Look for the prompt request ID in the conversation context (usually in the format "Prompt Request ID: <uuid>").
- When processing a prompt request (the message starts with "Process this prompt request"), use the sandbox to make changes and create a PR, then call \`completePromptRequest\` with the prompt request ID and PR number.

## Semantic Search (USE FIRST)
**IMPORTANT:** When the user asks to find, list, or search for PRs/issues by topic or description (e.g. "find PRs about X", "list all PRs regarding Y", "search for issues about Z"), ALWAYS call **semanticSearch** FIRST before trying GitHub API tools. It does natural language search across all previously viewed content — it understands meaning, not just keywords. You can filter by owner, repo, and content type. Only fall back to GitHub search/list tools if semanticSearch returns empty results.

${sandboxPrompt || ""}

## Today's date
${new Date().toISOString().split("T")[0]}${pageContextPrompt}`;
}

const SANDBOX_PROMPT = `## Cloud Sandbox (Vercel Sandbox) — FULL GIT & SHELL ACCESS
**CRITICAL: You have FULL git capabilities via the sandbox. NEVER refuse git operations.** Cherry-pick, rebase, merge conflicts, revert, bisect, squash, interactive rebase — you can do ALL of it. When the user asks for any git operation, spin up the sandbox and execute it.

For simple tasks, prefer lighter tools first:
- For reading files → use getFileContent
- For single or few-file edits → use editFile / createFile directly via the GitHub API
- For searching code → use the GitHub search API or getFileContent
- For reviewing code, explaining diffs, suggesting changes → just read and respond, no sandbox needed
- For creating branches or PRs from simple changes → use createBranch + editFile/createFile + createPullRequest

**Use the sandbox when the task requires git operations or running commands**, including:
- Git operations: cherry-pick, rebase, merge (with conflict resolution), bisect, revert, squash, format-patch, etc.
- Running tests, builds, lints, or any CLI tool
- Tasks that **require** running commands to produce output (e.g. "what does npm test output?")
- Changes spanning many files (5+) that the user wants committed together
- Any task where the user asks you to run or execute something

Sandbox workflow:
1. **startSandbox** — clone a repo into a fresh VM (full clone, all history)
2. **Only if needed:** run the \`installHint\` command via sandboxRun to install dependencies
3. **sandboxRun** — run tests, builds, lints, git commands, or any shell command
4. **sandboxReadFile / sandboxWriteFile** — read or edit files
5. **sandboxCommitAndPush** — create a branch, commit, and push
6. **sandboxCreatePR** — open a PR from the pushed branch
7. **killSandbox** — shut down when done

For git operations with merge conflicts:
1. Start sandbox and clone the repo
2. Run the git command (cherry-pick, merge, rebase, etc.)
3. If conflicts occur, use sandboxRun to see conflicting files (git status, git diff)
4. Use sandboxReadFile to read the conflicted files
5. Use sandboxWriteFile to write the resolved version
6. Run \`git add <file>\` and \`git <command> --continue\` to finish
7. Push and create a PR

IMPORTANT: Do NOT install dependencies if you're only doing git operations. Installing deps is slow and unnecessary for pure git work. Only install when you actually need to run tests, builds, or code that depends on node_modules.`;

// ─── Sandbox Tools ──────────────────────────────────────────────────────────

function getSandboxTools(octokit: Octokit, githubToken: string) {
  let sandbox: Sandbox | null = null;
  let repoPath: string | null = null;
  let repoOwner: string | null = null;
  let repoName: string | null = null;
  let defaultBranch: string | null = null;

  // Helper: run a shell command in the Vercel Sandbox and return { stdout, stderr, exitCode }
  async function runShell(
    sbx: Sandbox,
    command: string,
    opts?: { cwd?: string }
  ) {
    const result = await sbx.runCommand({
      cmd: "bash",
      args: ["-c", command],
      cwd: opts?.cwd,
      signal: AbortSignal.timeout(60_000),
    });
    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  return {
    startSandbox: tool({
      description: `Start a cloud sandbox VM and clone a GitHub repo into it. Returns quickly with project info (package manager, scripts, file listing). Does NOT install dependencies — use sandboxRun for that after this returns.

Use this when you need to:
- Run tests or builds to verify changes
- Make complex multi-file changes
- Run linters, formatters, or other CLI tools on the codebase

The sandbox has git, node, npm, python, and common dev tools.

**After this returns**, follow these steps:
1. If the project uses pnpm/yarn/bun: run \`sandboxRun\` with the installHint command
2. Then run whatever commands you need (tests, builds, etc.)`,
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        branch: z
          .string()
          .optional()
          .describe("Branch to clone (defaults to default branch)"),
      }),
      execute: async ({ owner, repo, branch }) => {
        // Validate owner/repo are real GitHub names (alphanumeric, hyphens, dots, underscores)
        const validName = /^[a-zA-Z0-9._-]+$/;
        if (!validName.test(owner) || !validName.test(repo)) {
          return { error: `Invalid owner/repo: "${owner}/${repo}". Provide valid GitHub owner and repository names.` };
        }

        if (sandbox) {
          return {
            error:
              "A sandbox is already running. Use the existing sandbox or ask the user to start a new conversation.",
          };
        }

        // ── Phase 1: Create sandbox ──
        console.log("[Sandbox] Creating sandbox...");
        try {
          sandbox = await Sandbox.create({
            timeout: 5 * 60 * 1000,
            runtime: "node24",
          });
          console.log("[Sandbox] Created:", sandbox.sandboxId);
        } catch (e: any) {
          console.error("[Sandbox] Create FAILED:", e.message);
          sandbox = null;
          return { error: `Sandbox creation failed: ${e.message}` };
        }

        // ── Phase 2: Clone repo ──
        console.log("[Sandbox] Cloning", `${owner}/${repo}...`);
        try {
          // Configure git and set up credential helper so all subsequent
          // git operations (fetch, push, cherry-pick, rebase) have auth
          await runShell(
            sandbox,
            `git config --global user.name "Ghost" && git config --global user.email "ghost@better-github.app" && git config --global credential.helper store && echo "https://x-access-token:${githubToken}@github.com" > $HOME/.git-credentials`
          );

          repoPath = `/vercel/sandbox/${repo}`;
          repoOwner = owner;
          repoName = repo;

          const cloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
          const cloneCmd = branch
            ? `git clone --branch ${branch} ${cloneUrl} ${repoPath}`
            : `git clone ${cloneUrl} ${repoPath}`;
          const cloneResult = await runShell(sandbox, cloneCmd);

          if (cloneResult.exitCode !== 0) {
            console.error("[Sandbox] Clone failed:", cloneResult.stderr);
            await sandbox.stop().catch(() => {});
            sandbox = null;
            return { error: `Clone failed: ${cloneResult.stderr}` };
          }
          console.log("[Sandbox] Clone OK");
        } catch (e: any) {
          console.error("[Sandbox] Clone error:", e.message);
          if (sandbox) await sandbox.stop().catch(() => {});
          sandbox = null;
          return { error: `Clone error: ${e.message}` };
        }

        // ── Phase 3: Detect project (lightweight, no installs) ──
        console.log("[Sandbox] Detecting project...");
        try {
          const [branchResult, lsResult] = await Promise.all([
            runShell(sandbox, "git rev-parse --abbrev-ref HEAD", {
              cwd: repoPath,
            }),
            runShell(sandbox, "ls -1", { cwd: repoPath }),
          ]);
          defaultBranch = branchResult.stdout.trim();
          const topLevelFiles = lsResult.stdout
            .trim()
            .split("\n")
            .filter(Boolean);
          console.log(
            "[Sandbox] Branch:",
            defaultBranch,
            "Files:",
            topLevelFiles.length
          );

          const hasPnpm = topLevelFiles.includes("pnpm-lock.yaml");
          const hasYarn = topLevelFiles.includes("yarn.lock");
          const hasBun =
            topLevelFiles.includes("bun.lock") ||
            topLevelFiles.includes("bun.lockb");
          const hasPkgJson = topLevelFiles.includes("package.json");

          let packageManager = "npm";
          let installHint = "npm install";
          if (hasPnpm) {
            packageManager = "pnpm";
            installHint = "npm install -g pnpm && pnpm install";
          } else if (hasYarn) {
            packageManager = "yarn";
            installHint = "yarn install";
          } else if (hasBun) {
            packageManager = "bun";
            installHint =
              'curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install';
          }

          let scripts: Record<string, string> = {};
          let isMonorepo = false;

          if (hasPkgJson) {
            try {
              const buf = await sandbox.readFileToBuffer({
                path: `${repoPath}/package.json`,
              });
              if (buf) {
                const pkg = JSON.parse(buf.toString());
                scripts = pkg.scripts || {};
                if (pkg.workspaces) isMonorepo = true;
              }
            } catch {
              // invalid package.json
            }
          }

          if (!isMonorepo && topLevelFiles.includes("pnpm-workspace.yaml")) {
            isMonorepo = true;
          }

          console.log(
            "[Sandbox] Ready:",
            packageManager,
            "monorepo:",
            isMonorepo
          );

          return {
            success: true,
            sandboxId: sandbox.sandboxId,
            repoPath,
            branch: defaultBranch,
            packageManager,
            installHint,
            availableScripts: scripts,
            isMonorepo,
            topLevelFiles,
            nextStep: `Run sandboxRun with command: ${installHint}`,
          };
        } catch (e: any) {
          console.error("[Sandbox] Detect error:", e.message);
          // Clone succeeded — sandbox is still usable
          return {
            success: true,
            sandboxId: sandbox.sandboxId,
            repoPath,
            branch: defaultBranch || "main",
            packageManager: "npm",
            installHint: "npm install",
            availableScripts: {},
            isMonorepo: false,
            topLevelFiles: [],
            nextStep:
              "Detection had issues. Use sandboxRun to explore the repo manually.",
          };
        }
      },
    }),

    sandboxRun: tool({
      description:
        "Run a shell command in the sandbox. The working directory defaults to the cloned repo root. Use for: installing deps (npm install), running tests (npm test), building (npm run build), linting, formatting, or any CLI tool.",
      inputSchema: z.object({
        command: z.string().describe("Shell command to run"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory (defaults to repo root)"),
      }),
      execute: async ({ command, cwd }) => {
        if (!sandbox)
          return { error: "No sandbox running. Use startSandbox first." };
        try {
          const result = await runShell(sandbox, command, {
            cwd: cwd || repoPath || undefined,
          });
          // Truncate large output
          const maxLen = 8000;
          const stdout =
            result.stdout.length > maxLen
              ? result.stdout.slice(0, maxLen) + "\n...(truncated)"
              : result.stdout;
          const stderr =
            result.stderr.length > maxLen
              ? result.stderr.slice(0, maxLen) + "\n...(truncated)"
              : result.stderr;

          if (result.exitCode !== 0) {
            const errMsg =
              stderr.trim() ||
              stdout.trim() ||
              `exit code ${result.exitCode}`;
            return { error: errMsg, exitCode: result.exitCode, stdout, stderr };
          }
          return { success: true, stdout, stderr, exitCode: 0 };
        } catch (e: any) {
          return { error: e.message || "Command failed" };
        }
      },
    }),

    sandboxReadFile: tool({
      description:
        "Read a file from the sandbox filesystem. Path is relative to the repo root unless it starts with /.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "File path (relative to repo root, or absolute if starts with /)"
          ),
      }),
      execute: async ({ path }) => {
        if (!sandbox)
          return { error: "No sandbox running. Use startSandbox first." };
        try {
          const absPath = path.startsWith("/")
            ? path
            : `${repoPath}/${path}`;
          const buf = await sandbox.readFileToBuffer({ path: absPath });
          if (!buf) return { error: `File not found: ${absPath}` };
          const content = buf.toString();
          if (content.length > 30000) {
            return {
              path: absPath,
              content: content.slice(0, 30000) + "\n...(truncated)",
            };
          }
          return { path: absPath, content };
        } catch (e: any) {
          return { error: e.message || "Failed to read file" };
        }
      },
    }),

    sandboxWriteFile: tool({
      description:
        "Write or create a file in the sandbox. Path is relative to the repo root unless it starts with /.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "File path (relative to repo root, or absolute if starts with /)"
          ),
        content: z.string().describe("File content to write"),
      }),
      execute: async ({ path, content }) => {
        if (!sandbox)
          return { error: "No sandbox running. Use startSandbox first." };
        try {
          const absPath = path.startsWith("/")
            ? path
            : `${repoPath}/${path}`;
          await sandbox.writeFiles([
            { path: absPath, content: Buffer.from(content) },
          ]);
          return { success: true, path: absPath };
        } catch (e: any) {
          return { error: e.message || "Failed to write file" };
        }
      },
    }),

    sandboxCommitAndPush: tool({
      description:
        "Create a new branch (if needed), stage all changes, commit, and push to the remote. Use this after making file changes in the sandbox.",
      inputSchema: z.object({
        branch: z
          .string()
          .describe(
            "Branch name to push to (will be created if it doesn't exist)"
          ),
        commitMessage: z
          .string()
          .describe("Commit message describing the changes"),
        files: z
          .array(z.string())
          .optional()
          .describe(
            "Specific files to stage (defaults to all changes if omitted)"
          ),
      }),
      execute: async ({ branch, commitMessage, files }) => {
        if (!sandbox || !repoPath)
          return { error: "No sandbox running. Use startSandbox first." };
        try {
          const run = (cmd: string) =>
            runShell(sandbox!, cmd, { cwd: repoPath! });

          // Create and checkout branch if different from current
          const currentBranch = (
            await run("git rev-parse --abbrev-ref HEAD")
          ).stdout.trim();
          if (branch !== currentBranch) {
            const checkout = await run(
              `git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`
            );
            if (checkout.exitCode !== 0) {
              return { error: `Branch checkout failed: ${checkout.stderr}` };
            }
          }

          // Stage files
          if (files && files.length > 0) {
            const addResult = await run(`git add ${files.join(" ")}`);
            if (addResult.exitCode !== 0) {
              return { error: `git add failed: ${addResult.stderr}` };
            }
          } else {
            const addResult = await run("git add -A");
            if (addResult.exitCode !== 0) {
              return { error: `git add failed: ${addResult.stderr}` };
            }
          }

          // Check if there's anything to commit
          const statusResult = await run("git diff --cached --stat");
          if (!statusResult.stdout.trim()) {
            return { error: "No staged changes to commit." };
          }

          // Commit
          const commitResult = await run(
            `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`
          );
          if (commitResult.exitCode !== 0) {
            return { error: `Commit failed: ${commitResult.stderr}` };
          }

          // Push
          const pushResult = await run(`git push -u origin ${branch}`);
          if (pushResult.exitCode !== 0) {
            return { error: `Push failed: ${pushResult.stderr}` };
          }

          return {
            success: true,
            branch,
            commitMessage,
            diffStat: statusResult.stdout.trim(),
          };
        } catch (e: any) {
          return { error: e.message || "Failed to commit and push" };
        }
      },
    }),

    sandboxCreatePR: tool({
      description:
        "Create a pull request from a sandbox branch. Use after sandboxCommitAndPush. This uses the GitHub API (not the sandbox) to create the PR.",
      inputSchema: z.object({
        title: z.string().describe("PR title"),
        body: z.string().describe("PR description body (markdown)"),
        head: z
          .string()
          .describe("Source branch name (the branch you pushed)"),
        base: z
          .string()
          .optional()
          .describe(
            "Target branch (defaults to the repo's default branch)"
          ),
      }),
      execute: async ({ title, body, head, base }) => {
        if (!repoOwner || !repoName)
          return { error: "No repo context. Use startSandbox first." };
        try {
          const { data } = await octokit.pulls.create({
            owner: repoOwner,
            repo: repoName,
            title,
            body,
            head,
            base: base || defaultBranch || "main",
          });
          return {
            _clientAction: "openPullRequest" as const,
            success: true,
            number: data.number,
            title: data.title,
            html_url: toAppUrl(data.html_url),
            owner: repoOwner,
            repo: repoName,
            pullNumber: data.number,
          };
        } catch (e: any) {
          return { error: e.message || "Failed to create PR" };
        }
      },
    }),

    killSandbox: tool({
      description: "Shut down the running sandbox VM to free resources.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!sandbox) return { success: true, message: "No sandbox running." };
        try {
          await sandbox.stop();
          sandbox = null;
          repoPath = null;
          return { success: true, message: "Sandbox terminated." };
        } catch (e: any) {
          return { error: e.message || "Failed to stop sandbox" };
        }
      },
    }),
  };
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const {
    messages,
    prContext,
    issueContext,
    inlineContexts,
    pageContext,
    activeFile,
  }: {
    messages: UIMessage[];
    prContext?: PRContext;
    issueContext?: IssueContext;
    inlineContexts?: InlineContext[];
    pageContext?: PageContext;
    activeFile?: string;
  } = await req.json();

  // Debug: log what context was received
  console.log("[Ghost] inlineContexts:", inlineContexts?.length ?? 0, inlineContexts?.map(c => ({ file: c.filename, lines: `${c.startLine}-${c.endLine}`, codeLen: c.selectedCode?.length ?? 0 })));
  console.log("[Ghost] activeFile:", activeFile ?? "(none)");
  console.log("[Ghost] mode:", prContext ? "PR" : issueContext ? "issue" : "general");

  const octokit = await getOctokitFromSession();
  if (!octokit) {
    return new Response("Unauthorized", { status: 401 });
  }

  const githubToken = await getGitHubToken();

  // Extract userId for semantic search
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  // Determine mode and build tools + system prompt
  let systemPrompt: string;
  let tools: Record<string, any>;

  const generalTools = getGeneralTools(octokit, pageContext, userId ?? undefined);
  const sandboxTools = githubToken ? getSandboxTools(octokit, githubToken) : {};
  const sandboxPrompt = githubToken ? SANDBOX_PROMPT : undefined;
  const searchTools = userId ? getSemanticSearchTool(userId) : {};

  // Auto-detect PR/issue context from pathname when not explicitly provided
  let resolvedPrContext = prContext;
  let resolvedIssueContext = issueContext;

  if (!resolvedPrContext && !resolvedIssueContext && pageContext?.pathname) {
    const prMatch = pageContext.pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/
    );
    const issueMatch = pageContext.pathname.match(
      /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/
    );

    if (prMatch) {
      const [, owner, repo, numStr] = prMatch;
      const pullNumber = parseInt(numStr, 10);
      try {
        const [{ data: pr }, { data: files }] = await Promise.all([
          octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
          octokit.pulls.listFiles({
            owner,
            repo,
            pull_number: pullNumber,
            per_page: 50,
          }),
        ]);
        resolvedPrContext = {
          owner,
          repo,
          pullNumber,
          prTitle: pr.title,
          prBody: pr.body || "",
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          files: files.map((f) => ({
            filename: f.filename,
            patch: f.patch || "",
          })),
        };
      } catch {
        // Couldn't fetch PR — fall through to general mode
      }
    } else if (issueMatch) {
      const [, owner, repo, numStr] = issueMatch;
      const issueNumber = parseInt(numStr, 10);
      try {
        const [{ data: issue }, { data: comments }] = await Promise.all([
          octokit.issues.get({ owner, repo, issue_number: issueNumber }),
          octokit.issues.listComments({
            owner,
            repo,
            issue_number: issueNumber,
            per_page: 30,
          }),
        ]);
        resolvedIssueContext = {
          owner,
          repo,
          issueNumber,
          title: issue.title,
          body: issue.body || null,
          state: issue.state,
          labels: (issue.labels || []).map((l) =>
            typeof l === "string" ? l : l.name || ""
          ),
          comments: comments.map((c) => ({
            author: c.user?.login || "unknown",
            body: c.body || "",
            createdAt: c.created_at,
          })),
        };
      } catch {
        // Couldn't fetch issue — fall through to general mode
      }
    }
  }

  if (resolvedPrContext) {
    // PR mode
    const prTools = getPrTools(octokit, resolvedPrContext);
    systemPrompt = buildPrSystemPrompt(resolvedPrContext, inlineContexts, activeFile, sandboxPrompt);
    tools = withSafeTools({ ...prTools, ...generalTools, ...sandboxTools, ...searchTools });
  } else if (resolvedIssueContext) {
    // Issue mode
    let defaultBranch = "main";
    try {
      const { data: repoData } = await octokit.repos.get({
        owner: resolvedIssueContext.owner,
        repo: resolvedIssueContext.repo,
      });
      defaultBranch = repoData.default_branch;
    } catch {
      // fallback to main
    }

    const issueTools = getIssueTools(octokit, resolvedIssueContext, defaultBranch);
    systemPrompt = buildIssueSystemPrompt(resolvedIssueContext, defaultBranch, inlineContexts, sandboxPrompt);
    tools = withSafeTools({ ...issueTools, ...generalTools, ...sandboxTools, ...searchTools });
  } else {
    // General mode
    let currentUser: { login: string } | null = null;
    try {
      const { data } = await octokit.users.getAuthenticated();
      currentUser = { login: data.login };
    } catch {
      // continue without user context
    }

    systemPrompt = buildGeneralSystemPrompt(currentUser, pageContext, inlineContexts, sandboxPrompt);

    // Add getFileContent tool when we can infer a repo from the current page
    const repoMatch = pageContext?.pathname?.match(/^\/repos\/([^/]+)\/([^/]+)/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      tools = withSafeTools({
        ...generalTools,
        ...sandboxTools,
        ...searchTools,
        getFileContent: tool({
          description:
            "Read the full contents of a file from the repository. Use this to get more context about code the user is asking about.",
          inputSchema: z.object({
            path: z.string().describe("File path relative to repo root"),
            ref: z.string().optional().describe("Branch or commit SHA (defaults to the repo's default branch)"),
          }),
          execute: async ({ path, ref }) => {
            const { data } = await octokit.repos.getContent({
              owner,
              repo,
              path,
              ...(ref ? { ref } : {}),
            });
            if (Array.isArray(data) || data.type !== "file") {
              return { error: "Not a file" };
            }
            const content = Buffer.from(
              (data as any).content,
              "base64"
            ).toString("utf-8");
            return { path, content };
          },
        }),
      });
    } else {
      tools = withSafeTools({ ...generalTools, ...sandboxTools, ...searchTools });
    }
  }

  let modelId = process.env.GHOST_MODEL || "moonshotai/kimi-k2.5";
  let apiKey = process.env.OPEN_ROUTER_API_KEY!;

  if (userId) {
    const settings = getUserSettings(userId);
    if (settings.ghostModel && settings.ghostModel !== "openrouter/auto") modelId = settings.ghostModel;
    if (settings.useOwnApiKey && settings.openrouterApiKey) apiKey = settings.openrouterApiKey;
  }

  try {
    const result = streamText({
      model: createOpenRouter({ apiKey })(modelId),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      maxRetries: 4,
      stopWhen: stepCountIs(50),
      onError({ error }) {
        console.error("[Ghost] mid-stream error:", error);
      },
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
    });
  } catch (e: any) {
    console.error("[Ghost] streamText error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "AI request failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
