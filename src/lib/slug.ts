import { prisma } from "@/lib/db";

/** Convert a string to a URL-friendly slug */
export function toSlug(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Generate a unique slug for a tournament (appends year + suffix if needed) */
export async function generateTournamentSlug(name: string, city: string, year: number, excludeId?: string): Promise<string> {
  const base = toSlug(`${name}-${city}-${year}`);

  // Try base slug first, then append -2, -3, etc.
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await prisma.tournament.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  // Fallback: base + random suffix
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
