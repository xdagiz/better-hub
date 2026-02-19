import { getRepoContributors, getRepoContributorStats } from "@/lib/github";
import { PeopleList } from "@/components/people/people-list";

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const [contributorsData, contributorStats] = await Promise.all([
    getRepoContributors(owner, repo, 100),
    getRepoContributorStats(owner, repo),
  ]);

  // Build weekly commit data + additions/deletions per contributor
  const weeklyMap: Record<string, number[]> = {};
  const diffMap: Record<string, { additions: number; deletions: number; monthAdditions: number; monthDeletions: number }> = {};
  for (const stat of contributorStats) {
    if (stat.login) {
      const key = stat.login.toLowerCase();
      const recentWeeks = stat.weeks.slice(-12);
      weeklyMap[key] = recentWeeks.map((w) => w.c);
      const last4 = stat.weeks.slice(-4);
      diffMap[key] = {
        additions: stat.weeks.reduce((s, w) => s + w.a, 0),
        deletions: stat.weeks.reduce((s, w) => s + w.d, 0),
        monthAdditions: last4.reduce((s, w) => s + w.a, 0),
        monthDeletions: last4.reduce((s, w) => s + w.d, 0),
      };
    }
  }

  const people = contributorsData.list.map((c) => {
    const key = c.login.toLowerCase();
    return {
      login: c.login,
      avatar_url: c.avatar_url,
      contributions: c.contributions,
      weeklyCommits: weeklyMap[key] ?? [],
      additions: diffMap[key]?.additions ?? 0,
      deletions: diffMap[key]?.deletions ?? 0,
      monthAdditions: diffMap[key]?.monthAdditions ?? 0,
      monthDeletions: diffMap[key]?.monthDeletions ?? 0,
    };
  });

  return <PeopleList owner={owner} repo={repo} people={people} />;
}
