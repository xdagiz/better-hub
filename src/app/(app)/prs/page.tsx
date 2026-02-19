import { getAuthenticatedUser, searchIssues } from "@/lib/github";
import { PRsContent } from "@/components/prs/prs-content";

export default async function PRsPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const [created, reviewRequested, assigned, mentioned] = await Promise.all([
    searchIssues(`is:pr is:open author:${user.login}`, 30),
    searchIssues(`is:pr is:open review-requested:${user.login}`, 30),
    searchIssues(`is:pr is:open assignee:${user.login}`, 30),
    searchIssues(`is:pr is:open mentions:${user.login}`, 20),
  ]);

  return (
    <PRsContent
      created={created as any}
      reviewRequested={reviewRequested as any}
      assigned={assigned as any}
      mentioned={mentioned as any}
      username={user.login}
    />
  );
}
