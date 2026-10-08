"use server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { apiMsg } from "@/lib/api-messages";

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "ADMIN") throw new Error(apiMsg("not_authorized"));
}

export async function activatePlayer(playerId: string) {
  await requireAdmin();
  await prisma.player.update({ where: { id: playerId }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/players");
}

export async function suspendPlayer(playerId: string) {
  await requireAdmin();
  await prisma.player.update({ where: { id: playerId }, data: { status: "REJECTED" } });
  revalidatePath("/admin/players");
}
