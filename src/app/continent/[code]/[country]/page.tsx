import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ClubCard } from "@/components/ClubCard";

const continentNames: Record<string, string> = {
  NA: "North America", SA: "South America", EU: "Europe",
  AF: "Africa", AS: "Asia", OC: "Oceania",
};

export default async function CountryPage({
  params,
}: {
  params: { code: string; country: string };
}) {
  const code = params.code.toUpperCase();
  const country = decodeURIComponent(params.country);

  const clubs = await prisma.club.findMany({
    where: { continentCode: code, country, approved: true },
    include: {
      _count: {
        select: { members: { where: { status: "MEMBER" } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Vérifier que le continent est valide
  if (!continentNames[code]) notFound();

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link className="ghost" href={`/continent/${code}`} style={{ fontSize: 13 }}>
              ← {continentNames[code]}
            </Link>
          </div>
          <h1>{country}</h1>
          <p className="meta">{clubs.length} club{clubs.length > 1 ? "s" : ""}</p>
        </div>
        <Link className="primary" href={`/club/new`}>
          + Ajouter votre club
        </Link>
      </div>

      {clubs.length > 0 ? (
        <div className="club-grid">
          {clubs.map((c) => (
            <ClubCard
              key={c.id}
              id={c.id}
              name={c.name}
              city={c.city}
              country={c.country}
              logoPath={c.logoPath ?? undefined}
              memberCount={c._count.members}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>Aucun club dans ce pays pour l&apos;instant.</p>
          <Link className="primary" href="/club/new" style={{ marginTop: 12, display: "inline-flex" }}>
            Créer le premier club
          </Link>
        </div>
      )}
    </div>
  );
}
