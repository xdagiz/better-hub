import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/user-settings-store";

function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = getUserSettings(session.user.id);

  return Response.json({
    ...settings,
    openrouterApiKey: maskApiKey(settings.openrouterApiKey),
  });
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  const allowedFields = [
    "displayName",
    "theme",
    "colorTheme",
    "ghostModel",
    "useOwnApiKey",
    "openrouterApiKey",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const settings = updateUserSettings(session.user.id, updates);

  return Response.json({
    ...settings,
    openrouterApiKey: maskApiKey(settings.openrouterApiKey),
  });
}
