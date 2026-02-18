"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  createCollection,
  renameCollection,
  deleteCollection,
  addItem,
  removeItem,
  toggleReviewed,
  getCollectionsForPR,
} from "@/lib/collections-store";

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user?.id ?? null;
}

export async function createCollectionAction(
  name: string
): Promise<{ id: string; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { id: "", error: "Not authenticated" };
  if (!name.trim()) return { id: "", error: "Name is required" };

  const collection = createCollection(userId, name.trim());
  revalidatePath("/collections");
  return { id: collection.id };
}

export async function renameCollectionAction(
  id: string,
  name: string
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };
  if (!name.trim()) return { error: "Name is required" };

  renameCollection(id, userId, name.trim());
  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
  return {};
}

export async function deleteCollectionAction(
  id: string
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };

  deleteCollection(id, userId);
  revalidatePath("/collections");
  return {};
}

export async function addPRToCollectionAction(
  collectionId: string,
  owner: string,
  repo: string,
  prNumber: number,
  prTitle: string
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };

  const item = addItem(collectionId, userId, {
    owner,
    repo,
    prNumber,
    prTitle,
  });
  if (!item) return { error: "Already in collection or collection not found" };

  revalidatePath(`/collections/${collectionId}`);
  return {};
}

export async function removePRFromCollectionAction(
  itemId: string,
  collectionId: string
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };

  removeItem(itemId, userId);
  revalidatePath(`/collections/${collectionId}`);
  return {};
}

export async function toggleReviewedAction(
  itemId: string,
  reviewed: boolean,
  collectionId: string
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated" };

  toggleReviewed(itemId, userId, reviewed);
  revalidatePath(`/collections/${collectionId}`);
  return {};
}

export async function createCollectionWithPRAction(
  name: string,
  owner: string,
  repo: string,
  prNumber: number,
  prTitle: string
): Promise<{ id: string; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { id: "", error: "Not authenticated" };
  if (!name.trim()) return { id: "", error: "Name is required" };

  const collection = createCollection(userId, name.trim());
  addItem(collection.id, userId, { owner, repo, prNumber, prTitle });
  revalidatePath("/collections");
  return { id: collection.id };
}

export async function getCollectionsForPRAction(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ collections: { id: string; name: string; hasItem: boolean }[] }> {
  const userId = await getUserId();
  if (!userId) return { collections: [] };

  const result = getCollectionsForPR(userId, owner, repo, prNumber);
  return {
    collections: result.map((r) => ({
      id: r.collection.id,
      name: r.collection.name,
      hasItem: r.hasItem,
    })),
  };
}
