"use server";

import { revalidatePath } from "next/cache";
import {
  updatePromptRequestStatus,
  deletePromptRequest,
  getPromptRequest,
} from "@/lib/prompt-request-store";

export async function acceptPromptRequest(id: string) {
  const pr = getPromptRequest(id);
  if (!pr) throw new Error("Prompt request not found");
  if (pr.status !== "open") throw new Error("Prompt request is not open");

  updatePromptRequestStatus(id, "processing");
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function rejectPromptRequest(id: string) {
  const pr = getPromptRequest(id);
  if (!pr) throw new Error("Prompt request not found");

  updatePromptRequestStatus(id, "rejected");
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function resetPromptRequest(id: string) {
  const pr = getPromptRequest(id);
  if (!pr) throw new Error("Prompt request not found");
  if (pr.status !== "processing") throw new Error("Prompt request is not processing");

  updatePromptRequestStatus(id, "open");
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function deletePromptRequestAction(id: string) {
  const pr = getPromptRequest(id);
  if (!pr) throw new Error("Prompt request not found");

  deletePromptRequest(id);
  revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
}
