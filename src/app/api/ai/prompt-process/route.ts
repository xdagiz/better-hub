import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getOctokitFromSession, getGitHubToken } from "@/lib/ai-auth";
import type { Octokit } from "@octokit/rest";
import { Sandbox } from "@vercel/sandbox";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { after } from "next/server";
import { getUserSettings } from "@/lib/user-settings-store";
import {
  getPromptRequest,
  updatePromptRequestStatus,
} from "@/lib/prompt-request-store";

export const maxDuration = 300;

// ─── Sandbox tools for background processing ────────────────────────────────

function buildBackgroundTools(octokit: Octokit, githubToken: string, owner: string, repo: string, promptRequestId: string) {
  let sandbox: Sandbox | null = null;
  let repoPath: string | null = null;
  let defaultBranch: string | null = null;

  async function runShell(sbx: Sandbox, command: string, opts?: { cwd?: string }) {
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
    getFileContent: tool({
      description: "Read the full contents of a file from the repository.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to repo root"),
        ref: z.string().optional().describe("Branch or commit SHA"),
      }),
      execute: async ({ path, ref }) => {
        const { data } = await octokit.repos.getContent({
          owner, repo, path,
          ...(ref ? { ref } : {}),
        });
        if (Array.isArray(data) || data.type !== "file") return { error: "Not a file" };
        const content = Buffer.from((data as any).content, "base64").toString("utf-8");
        return { path, content };
      },
    }),

    startSandbox: tool({
      description: "Start a cloud sandbox VM and clone the repository. Use for making code changes.",
      inputSchema: z.object({
        branch: z.string().optional().describe("Branch to clone (defaults to default branch)"),
      }),
      execute: async ({ branch }) => {
        if (sandbox) return { error: "Sandbox already running." };

        try {
          sandbox = await Sandbox.create({ timeout: 5 * 60 * 1000, runtime: "node24" });
        } catch (e: any) {
          sandbox = null;
          return { error: `Sandbox creation failed: ${e.message}` };
        }

        try {
          await runShell(sandbox,
            `git config --global user.name "Ghost" && git config --global user.email "ghost@better-github.app" && git config --global credential.helper store && echo "https://x-access-token:${githubToken}@github.com" > $HOME/.git-credentials`
          );

          repoPath = `/vercel/sandbox/${repo}`;
          const cloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
          const cloneCmd = branch
            ? `git clone --branch ${branch} ${cloneUrl} ${repoPath}`
            : `git clone ${cloneUrl} ${repoPath}`;
          const cloneResult = await runShell(sandbox, cloneCmd);

          if (cloneResult.exitCode !== 0) {
            await sandbox.stop().catch(() => {});
            sandbox = null;
            return { error: `Clone failed: ${cloneResult.stderr}` };
          }

          // Detect default branch and project info
          const branchResult = await runShell(sandbox, "git rev-parse --abbrev-ref HEAD", { cwd: repoPath });
          defaultBranch = branchResult.stdout.trim() || "main";

          const lsResult = await runShell(sandbox, "ls -la", { cwd: repoPath });
          return {
            success: true,
            repoPath,
            defaultBranch,
            files: lsResult.stdout,
          };
        } catch (e: any) {
          if (sandbox) await sandbox.stop().catch(() => {});
          sandbox = null;
          return { error: `Clone error: ${e.message}` };
        }
      },
    }),

    sandboxRun: tool({
      description: "Run a shell command in the sandbox.",
      inputSchema: z.object({
        command: z.string().describe("Shell command to execute"),
      }),
      execute: async ({ command }) => {
        if (!sandbox || !repoPath) return { error: "No sandbox running. Call startSandbox first." };
        const result = await runShell(sandbox, command, { cwd: repoPath });
        return { exitCode: result.exitCode, stdout: result.stdout.slice(0, 10000), stderr: result.stderr.slice(0, 5000) };
      },
    }),

    sandboxReadFile: tool({
      description: "Read a file from the sandbox filesystem.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path or path relative to repo root"),
      }),
      execute: async ({ path: filePath }) => {
        if (!sandbox || !repoPath) return { error: "No sandbox running." };
        const absPath = filePath.startsWith("/") ? filePath : `${repoPath}/${filePath}`;
        try {
          const buf = await sandbox.readFileToBuffer({ path: absPath });
          if (!buf) return { error: `File not found: ${absPath}` };
          return { path: filePath, content: buf.toString() };
        } catch (e: any) {
          return { error: e.message || "Failed to read file" };
        }
      },
    }),

    sandboxWriteFile: tool({
      description: "Write content to a file in the sandbox.",
      inputSchema: z.object({
        path: z.string().describe("Absolute path or path relative to repo root"),
        content: z.string().describe("File content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        if (!sandbox || !repoPath) return { error: "No sandbox running." };
        const absPath = filePath.startsWith("/") ? filePath : `${repoPath}/${filePath}`;
        try {
          await sandbox.writeFiles([{ path: absPath, content: Buffer.from(content) }]);
          return { success: true, path: filePath };
        } catch (e: any) {
          return { error: e.message || "Failed to write file" };
        }
      },
    }),

    sandboxCommitAndPush: tool({
      description: "Create a branch, commit all changes, and push to remote.",
      inputSchema: z.object({
        branch: z.string().describe("Branch name to create"),
        commitMessage: z.string().describe("Commit message"),
      }),
      execute: async ({ branch, commitMessage }) => {
        if (!sandbox || !repoPath) return { error: "No sandbox running." };
        try {
          await runShell(sandbox, `git checkout -b ${branch}`, { cwd: repoPath });
          await runShell(sandbox, "git add -A", { cwd: repoPath });
          const statusResult = await runShell(sandbox, "git diff --cached --stat", { cwd: repoPath });
          await runShell(sandbox, `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: repoPath });
          const pushResult = await runShell(sandbox, `git push origin ${branch}`, { cwd: repoPath });
          if (pushResult.exitCode !== 0) return { error: `Push failed: ${pushResult.stderr}` };
          return { success: true, branch, commitMessage, diffStat: statusResult.stdout.trim() };
        } catch (e: any) {
          return { error: e.message || "Failed to commit and push" };
        }
      },
    }),

    sandboxCreatePR: tool({
      description: "Create a pull request from a sandbox branch.",
      inputSchema: z.object({
        title: z.string().describe("PR title"),
        body: z.string().describe("PR description body (markdown)"),
        head: z.string().describe("Source branch name"),
        base: z.string().optional().describe("Target branch (defaults to default branch)"),
      }),
      execute: async ({ title, body, head, base }) => {
        try {
          const { data } = await octokit.pulls.create({
            owner, repo, title, body,
            head,
            base: base || defaultBranch || "main",
          });

          // Mark prompt request as completed
          updatePromptRequestStatus(promptRequestId, "completed", { prNumber: data.number });

          return { success: true, number: data.number, title: data.title };
        } catch (e: any) {
          return { error: e.message || "Failed to create PR" };
        }
      },
    }),

    killSandbox: tool({
      description: "Shut down the sandbox VM.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!sandbox) return { success: true };
        try {
          await sandbox.stop();
          sandbox = null;
          repoPath = null;
          return { success: true };
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),
  };
}

// ─── Background processor ───────────────────────────────────────────────────

async function processPromptRequestInBackground(
  promptRequestId: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  octokit: Octokit,
  githubToken: string,
  userId: string,
) {
  console.log(`[PromptProcess] Starting background processing for ${promptRequestId}`);

  const tools = buildBackgroundTools(octokit, githubToken, owner, repo, promptRequestId);

  let modelId = process.env.GHOST_MODEL || "moonshotai/kimi-k2.5";
  let apiKey = process.env.OPEN_ROUTER_API_KEY!;

  const settings = getUserSettings(userId);
  if (settings.ghostModel && settings.ghostModel !== "openrouter/auto") modelId = settings.ghostModel;
  if (settings.useOwnApiKey && settings.openrouterApiKey) apiKey = settings.openrouterApiKey;

  const systemPrompt = `You are Ghost, an AI developer agent. You are processing a prompt request in the background — there is no user chat, so do NOT ask questions or wait for confirmation. Execute the request fully and autonomously.

Your goal: implement the changes described in the prompt request, then create a Pull Request.

## Workflow
1. Read the instructions carefully
2. Use getFileContent to understand the current codebase
3. Use startSandbox to clone the repo
4. Use sandboxRun, sandboxReadFile, sandboxWriteFile to make changes
5. Use sandboxCommitAndPush to create a branch and push
6. Use sandboxCreatePR to open a pull request

## Rules
- Be thorough — implement everything described in the prompt
- Create meaningful branch names (e.g. "feat/add-dark-mode-support")
- Write clear commit messages
- Write a detailed PR description explaining all changes
- Do NOT ask for confirmation — just do it
- If you encounter an error, try to work around it
- Always call killSandbox when done

## Repository
- Owner: ${owner}
- Repo: ${repo}

## Today's date
${new Date().toISOString().split("T")[0]}`;

  try {
    await generateText({
      model: createOpenRouter({ apiKey })(modelId),
      system: systemPrompt,
      prompt: `Process this prompt request and open a PR:\n\n**${title}**\n\n${body}`,
      tools,
      maxRetries: 3,
      stopWhen: stepCountIs(50),
      onStepFinish({ toolResults }) {
        for (const tr of toolResults) {
          console.log(`[PromptProcess] Tool: ${tr.toolName}`);
        }
      },
    });

    // Check if the prompt request was marked completed by sandboxCreatePR
    const updated = getPromptRequest(promptRequestId);
    if (updated && updated.status !== "completed") {
      // AI finished but didn't create a PR — mark as failed
      updatePromptRequestStatus(promptRequestId, "open", {
        errorMessage: "Ghost finished processing but did not create a pull request. Try again or process manually.",
      });
    }

    console.log(`[PromptProcess] Finished processing ${promptRequestId}`);
  } catch (e: any) {
    console.error(`[PromptProcess] Failed for ${promptRequestId}:`, e.message);
    updatePromptRequestStatus(promptRequestId, "open", {
      errorMessage: e.message || "Processing failed unexpectedly",
    });
  }

  // Clean up sandbox if still running
  try {
    await tools.killSandbox.execute!({}, { messages: [], toolCallId: "" } as any);
  } catch {
    // ignore cleanup errors
  }
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { promptRequestId } = await req.json();
  if (!promptRequestId) {
    return Response.json({ error: "Missing promptRequestId" }, { status: 400 });
  }

  const octokit = await getOctokitFromSession();
  if (!octokit) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = await getGitHubToken();
  if (!githubToken) {
    return Response.json({ error: "No GitHub token" }, { status: 401 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "No user session" }, { status: 401 });
  }

  const pr = getPromptRequest(promptRequestId);
  if (!pr) {
    return Response.json({ error: "Prompt request not found" }, { status: 404 });
  }

  if (pr.status !== "processing") {
    return Response.json({ error: "Prompt request is not in processing state" }, { status: 400 });
  }

  // Schedule heavy work to run after the response is sent
  after(async () => {
    await processPromptRequestInBackground(
      promptRequestId,
      pr.owner,
      pr.repo,
      pr.title,
      pr.body,
      octokit,
      githubToken,
      userId,
    );
  });

  return Response.json({ success: true, message: "Processing started" });
}
