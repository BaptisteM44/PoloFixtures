"use server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function saveNotificationPreferences(formData: FormData) {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId;
  if (!playerId) return { error: "Non connecté" };

  const enabled = formData.get("enabled") === "on";
  const continents = formData.getAll("continents") as string[];
  const countries = formData.getAll("countries") as string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).notificationPreference.upsert({
    where: { playerId },
    create: { playerId, enabled, continents, countries },
    update: { enabled, continents, countries },
  });

  revalidatePath("/settings/notifications");
  return { ok: true };
}
