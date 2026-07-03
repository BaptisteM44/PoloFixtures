/**
 * GET /api/clubs/cities
 * Retourne toutes les villes distinctes (pairs city, country) issues de clubs existants
 * Utile pour l'autocomplete du sélecteur de ville dans le profil
 */

import { prisma } from "@/lib/db";

// Lit la DB à chaque requête — ne doit jamais être prerendered au build
export const dynamic = "force-dynamic";

export async function GET() {
  // Avoir toutes les villes distinctes avec leur pays
  const clubs = await prisma.club.findMany({
    where: { approved: true },
    select: { city: true, country: true },
    distinct: ["city", "country"],
    orderBy: [{ country: "asc" }, { city: "asc" }],
  });

  // Format : { city, country, label: "Paris, France" }
  const cities = clubs.map((c) => ({
    city: c.city,
    country: c.country,
    label: `${c.city}, ${c.country}`,
  }));

  return Response.json(cities);
}
