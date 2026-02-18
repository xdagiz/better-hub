import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAuthenticatedUser,
  getUserRepos,
  searchIssues,
  getNotifications,
  getContributionData,
  getUserEvents,
  getTrendingRepos,
} from "@/lib/github";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  const ghUser = await getAuthenticatedUser();
  if (!ghUser) return null;
  const username = ghUser.login;

  const [reviewRequests, myOpenPRs, myIssues, repos, notifications, contributions, activity, trending] =
    await Promise.all([
      searchIssues(`is:pr is:open review-requested:${username}`, 10),
      searchIssues(`is:pr is:open author:${username}`, 10),
      searchIssues(`is:issue is:open assignee:${username}`, 10),
      getUserRepos("updated", 30),
      getNotifications(20),
      getContributionData(username),
      getUserEvents(username, 20),
      getTrendingRepos(undefined, "weekly", 8),
    ]);

  return (
    <DashboardContent
      user={ghUser as any}
      reviewRequests={reviewRequests as any}
      myOpenPRs={myOpenPRs as any}
      myIssues={myIssues as any}
      repos={repos as any}
      notifications={notifications as any}
      contributions={contributions as any}
      activity={activity as any}
      trending={trending as any}
    />
  );
}
