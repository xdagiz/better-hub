import { getOrgMembers, getRepoContributors, getRepoContributorStats } from "@/lib/github";
import { PeopleList } from "@/components/people/people-list";

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const [members, contributorsData, contributorStats] = await Promise.all([
    getOrgMembers(owner),
    getRepoContributors(owner, repo, 100),
    getRepoContributorStats(owner, repo),
  ]);

  const contributionMap: Record<string, number> = {};
  for (const c of contributorsData.list) {
    if (c.login) {
      contributionMap[c.login.toLowerCase()] = c.contributions;
    }
  }

  // Build weekly commit data per contributor (last 12 weeks)
  const weeklyMap: Record<string, number[]> = {};
  for (const stat of contributorStats) {
    if (stat.login) {
      const recentWeeks = stat.weeks.slice(-12);
      weeklyMap[stat.login.toLowerCase()] = recentWeeks.map((w) => w.c);
    }
  }

  const people = (members as any[]).map((m: any) => ({
    login: m.login as string,
    avatar_url: m.avatar_url as string,
    contributions: contributionMap[m.login?.toLowerCase()] ?? 0,
    weeklyCommits: weeklyMap[m.login?.toLowerCase()] ?? [],
  }));

  return <PeopleList owner={owner} repo={repo} people={people} />;
}
