import { notFound } from "next/navigation";
import { getOrg, getOrgRepos } from "@/lib/github";
import { OrgDetailContent } from "@/components/orgs/org-detail-content";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  let orgData: Awaited<ReturnType<typeof getOrg>> = null;
  let reposData: Awaited<ReturnType<typeof getOrgRepos>> = [];

  try {
    [orgData, reposData] = await Promise.all([
      getOrg(org),
      getOrgRepos(org, { perPage: 100, sort: "updated", type: "all" }),
    ]);
  } catch {
    notFound();
  }

  if (!orgData) {
    notFound();
  }

  return (
    <OrgDetailContent
      org={{
        login: orgData.login,
        name: orgData.name ?? null,
        avatar_url: orgData.avatar_url,
        html_url: orgData.html_url ?? `https://github.com/${orgData.login}`,
        description: orgData.description ?? null,
        blog: orgData.blog || null,
        location: orgData.location || null,
        public_repos: orgData.public_repos,
        followers: orgData.followers,
        following: orgData.following,
        created_at: orgData.created_at,
      }}
      repos={reposData.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        fork: repo.fork,
        archived: repo.archived ?? false,
        language: repo.language ?? null,
        stargazers_count: repo.stargazers_count ?? 0,
        forks_count: repo.forks_count ?? 0,
        open_issues_count: repo.open_issues_count ?? 0,
        updated_at: repo.updated_at ?? null,
        pushed_at: repo.pushed_at ?? null,
      }))}
    />
  );
}
