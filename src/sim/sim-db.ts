/**
 * Utilitaires DB du harnais — module léger sans dépendance aux routes API.
 * SÉCURITÉ : refuse de tourner si la DB n'est pas bikepolo_sim sur localhost:5433.
 */
import { prisma } from "@/lib/db";

export async function assertSimDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost:5433") || /supabase|pooler|aws|r2|coolify/i.test(url)) {
    throw new Error(`SÉCURITÉ: DATABASE_URL n'est pas la DB de simulation locale (${url})`);
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT current_database() AS db`);
  if (rows[0]?.db !== "bikepolo_sim") {
    throw new Error(`SÉCURITÉ: connecté à "${rows[0]?.db}", attendu "bikepolo_sim"`);
  }
}

export async function resetSimDb(): Promise<void> {
  await assertSimDatabase();
  await prisma.$executeRawUnsafe(`TRUNCATE "Tournament", "Player" CASCADE`);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
