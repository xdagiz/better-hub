import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listCollections, getItems } from "@/lib/collections-store";
import { CollectionsContent } from "@/components/collections/collections-content";

export default async function CollectionsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) return null;

  const collections = listCollections(session.user.id);

  const collectionsWithCounts = collections.map((c) => {
    const items = getItems(c.id, session.user.id);
    const reviewedCount = items.filter((i) => i.reviewed).length;
    return {
      id: c.id,
      name: c.name,
      totalItems: items.length,
      reviewedItems: reviewedCount,
      updatedAt: c.updatedAt,
    };
  });

  return <CollectionsContent collections={collectionsWithCounts} />;
}
