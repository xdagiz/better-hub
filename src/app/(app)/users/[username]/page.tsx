import { notFound } from "next/navigation";
import {
  getUser,
  getUserPublicRepos,
  getUserPublicOrgs,
  getContributionData,
} from "@/lib/github";
import { UserProfileContent } from "@/components/users/user-profile-content";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  let userData: Awaited<ReturnType<typeof getUser>> = null;
  let reposData: Awaited<ReturnType<typeof getUserPublicRepos>> = [];
  let orgsData: Awaited<ReturnType<typeof getUserPublicOrgs>> = [];
  let contributionData: Awaited<ReturnType<typeof getContributionData>> = null;

  try {
    [userData, reposData, orgsData, contributionData] = await Promise.all([
      getUser(username),
      getUserPublicRepos(username, 100),
      getUserPublicOrgs(username),
      getContributionData(username),
    ]);
  } catch {
    notFound();
  }

  if (!userData) {
    notFound();
  }

  return (
    <UserProfileContent
      user={{
        login: userData.login,
        name: userData.name ?? null,
        avatar_url: userData.avatar_url,
        html_url: userData.html_url,
        bio: userData.bio ?? null,
        blog: userData.blog || null,
        location: userData.location || null,
        company: userData.company || null,
        twitter_username: (userData as any).twitter_username || null,
        public_repos: userData.public_repos,
        followers: userData.followers,
        following: userData.following,
        created_at: userData.created_at,
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
      orgs={orgsData.map((org) => ({
        login: org.login,
        avatar_url: org.avatar_url,
      }))}
      contributions={contributionData}
    />
  );
}
