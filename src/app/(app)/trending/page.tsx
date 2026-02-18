import { getTrendingRepos } from "@/lib/github";
import { TrendingContent } from "@/components/trending/trending-content";

export default async function TrendingPage() {
  const [weekly, daily, monthly] = await Promise.all([
    getTrendingRepos(undefined, "weekly", 25),
    getTrendingRepos(undefined, "daily", 25),
    getTrendingRepos(undefined, "monthly", 25),
  ]);

  return (
    <TrendingContent
      weekly={weekly as any}
      daily={daily as any}
      monthly={monthly as any}
    />
  );
}
