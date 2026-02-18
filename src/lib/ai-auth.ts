import { Octokit } from "@octokit/rest";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getOctokitFromSession(): Promise<Octokit | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) return null;

  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(session.user.id);
  const githubAccount = accounts.find(
    (account: { providerId: string }) => account.providerId === "github"
  );
  const token = githubAccount?.accessToken;
  if (!token) return null;

  return new Octokit({ auth: token });
}

export async function getGitHubToken(): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) return null;

  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(session.user.id);
  const githubAccount = accounts.find(
    (account: { providerId: string }) => account.providerId === "github"
  );
  return githubAccount?.accessToken ?? null;
}
