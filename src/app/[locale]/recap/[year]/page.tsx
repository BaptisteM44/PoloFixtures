/**
 * Récap « Ton année en bike polo » du joueur connecté (calculé à l'ouverture,
 * en lecture seule). Avant la date d'ouverture : admins seulement, pour le
 * rodage. Un admin peut voir celui de quelqu'un d'autre avec
 * ?player=<slug ou id>, pour vérifier les chiffres. Non indexé.
 */
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { YearRecapStory } from "@/components/recap/YearRecapStory";
import { computeYearRecap, recapIsOpen, RECAP_OPENS_AT } from "@/lib/year-in-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ton année en bike polo", robots: { index: false, follow: false } };

export default async function RecapPage({ params, searchParams }: { params: { locale: string; year: string }; searchParams: { player?: string } }) {
  const year = Number(params.year);
  if (!Number.isInteger(year) || !RECAP_OPENS_AT[year]) notFound();

  const session = await auth();
  const user = session?.user as { playerId?: string; role?: string } | undefined;
  if (!user) redirect(`/${params.locale}/login?next=/${params.locale}/recap/${year}`);
  const isAdmin = user.role === "ADMIN";

  if (!recapIsOpen(year) && !isAdmin) {
    const opens = new Date(RECAP_OPENS_AT[year]).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
    return (
      <section className="section" style={{ textAlign: "center", padding: "80px 20px" }}>
        <p style={{ fontSize: 48, margin: 0 }}>🎁</p>
        <h1 style={{ marginTop: 12 }}>Ton année {year} arrive le {opens}</h1>
        <p className="meta">Un petit récap de ta saison de bike polo, à partager.</p>
        <Link href="/" className="ghost">← Accueil</Link>
      </section>
    );
  }

  let playerId = user.playerId;
  if (isAdmin && searchParams.player) {
    const p = await prisma.player.findFirst({ where: { OR: [{ id: searchParams.player }, { slug: searchParams.player }] }, select: { id: true } });
    if (!p) notFound();
    playerId = p.id;
  }
  if (!playerId) notFound();

  const data = await computeYearRecap(playerId, year);
  if (!data) notFound();
  return <YearRecapStory data={data} closeHref="/" />;
}
