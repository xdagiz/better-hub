import { NextResponse } from "next/server";
import { getUserRepos } from "@/lib/github";

export async function GET() {
  const repos = await getUserRepos("updated", 100);
  const slim = (repos as any[]).map((r: any) => ({
    id: r.id,
    full_name: r.full_name,
    description: r.description ?? null,
    language: r.language ?? null,
    stargazers_count: r.stargazers_count ?? 0,
    owner: r.owner
      ? { login: r.owner.login, avatar_url: r.owner.avatar_url }
      : null,
  }));
  return NextResponse.json({ repos: slim });
}
