"use server";
import { prisma } from "@/lib/db";
import { NOTIF_CATEGORIES } from "@/lib/notify";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { apiMsg } from "@/lib/api-messages";

export async function saveNotificationPreferences(formData: FormData) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return { error: apiMsg("not_logged_in") };

  const enabled = formData.get("enabled") === "on";
  const continents = formData.getAll("continents") as string[];
  const countries = formData.getAll("countries") as string[];
  const notifyNewTournaments = formData.get("notifyNewTournaments") === "on";
  const notifyFollowedClosing = formData.get("notifyFollowedClosing") === "on";
  const notifySquadInvite = formData.get("notifySquadInvite") === "on";
  // Catégories décochées = coupées (seules les catégories connues sont gardées).
  const mutedCategories = (formData.getAll("mutedCategories") as string[])
    .filter((c) => (NOTIF_CATEGORIES as readonly string[]).includes(c));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).notificationPreference.upsert({
    where: { playerId },
    create: { playerId, enabled, continents, countries, notifyNewTournaments, notifyFollowedClosing, notifySquadInvite, mutedCategories },
    update: { enabled, continents, countries, notifyNewTournaments, notifyFollowedClosing, notifySquadInvite, mutedCategories },
  });

  revalidatePath("/settings/notifications");
  return { ok: true };
}
