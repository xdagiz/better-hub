import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCollection, getItems } from "@/lib/collections-store";
import { getPullRequest } from "@/lib/github";
import { CollectionDetail } from "@/components/collections/collection-detail";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) return null;

  const collection = getCollection(id, session.user.id);
  if (!collection) redirect("/collections");

  const items = getItems(id, session.user.id);

  // Fetch live PR state from GitHub for each item
  const liveData = await Promise.all(
    items.map(async (item) => {
      try {
        const pr = await getPullRequest(item.owner, item.repo, item.prNumber);
        return {
          itemId: item.id,
          state: (pr as any)?.state as string | null,
          merged: !!(pr as any)?.merged_at,
          draft: !!(pr as any)?.draft,
        };
      } catch {
        return { itemId: item.id, state: null, merged: false, draft: false };
      }
    })
  );

  const liveMap: Record<
    string,
    { state: string | null; merged: boolean; draft: boolean }
  > = {};
  for (const d of liveData) {
    liveMap[d.itemId] = {
      state: d.state,
      merged: d.merged,
      draft: d.draft,
    };
  }

  return (
    <CollectionDetail
      collection={{ id: collection.id, name: collection.name }}
      items={items.map((item) => ({
        id: item.id,
        owner: item.owner,
        repo: item.repo,
        prNumber: item.prNumber,
        prTitle: item.prTitle,
        reviewed: item.reviewed,
        position: item.position,
        state: liveMap[item.id]?.state ?? null,
        merged: liveMap[item.id]?.merged ?? false,
        draft: liveMap[item.id]?.draft ?? false,
      }))}
    />
  );
}
