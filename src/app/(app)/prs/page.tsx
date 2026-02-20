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
      created={created as Parameters<typeof PRsContent>[0]["created"]}
      reviewRequested={reviewRequested as Parameters<typeof PRsContent>[0]["reviewRequested"]}
      assigned={assigned as Parameters<typeof PRsContent>[0]["assigned"]}
      mentioned={mentioned as Parameters<typeof PRsContent>[0]["mentioned"]}
      username={user.login}
    />
  );
}
