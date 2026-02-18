import { getAuthenticatedUser, searchIssues } from "@/lib/github";
import { PRsContent } from "@/components/prs/prs-content";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listCollections, getItems } from "@/lib/collections-store";

export default async function PRsPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const session = await auth.api.getSession({ headers: await headers() });

  const [created, reviewRequested, assigned, mentioned] = await Promise.all([
    searchIssues(`is:pr is:open author:${user.login}`, 30),
    searchIssues(`is:pr is:open review-requested:${user.login}`, 30),
    searchIssues(`is:pr is:open assignee:${user.login}`, 30),
    searchIssues(`is:pr is:open mentions:${user.login}`, 20),
  ]);

  // Fetch collections for the tab
  let collections: {
    id: string;
    name: string;
    totalItems: number;
    reviewedItems: number;
    updatedAt: string;
  }[] = [];

  if (session?.user?.id) {
    const rawCollections = listCollections(session.user.id);
    collections = rawCollections.map((c) => {
      const items = getItems(c.id, session.user.id);
      return {
        id: c.id,
        name: c.name,
        totalItems: items.length,
        reviewedItems: items.filter((i) => i.reviewed).length,
        updatedAt: c.updatedAt,
      };
    });
  }

  return (
    <PRsContent
      created={created as any}
      reviewRequested={reviewRequested as any}
      assigned={assigned as any}
      mentioned={mentioned as any}
      username={user.login}
      collections={collections}
    />
  );
}
