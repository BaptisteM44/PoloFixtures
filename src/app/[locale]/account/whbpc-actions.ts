"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const editSchema = z.object({
  teamName: z.string().min(1).max(40),
  yearStarted: z.string().regex(/^\d{4}$/, "Année invalide"),
  countryCode: z.string().min(2).max(2),
  bestSkill: z.string().min(1).max(30),
  pedals: z.string().min(1).max(30),
  hand: z.enum(["RIGHTIE", "LEFTIE"]),
  wheelSize: z.string().min(1).max(6),
  gearRatio: z.string().min(1).max(10),
});

/** Player edits their own WHBPC card. Requires an existing card (gifted by an admin). */
export async function updateOwnWhbpcCardAction(data: z.infer<typeof editSchema>) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return { error: "Non connecté." };

  const parsed = editSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const existing = await prisma.whbpcCard.findUnique({ where: { playerId } });
  if (!existing) return { error: "Tu n'as pas cette carte." };

  await prisma.whbpcCard.update({ where: { playerId }, data: parsed.data });
  revalidatePath("/account");
  return { ok: true };
}
