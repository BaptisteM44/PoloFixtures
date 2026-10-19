import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { CoachCardAdminPanel } from "@/components/admin/CoachCardAdminPanel";
import { redirect } from "next/navigation";

export default async function AdminCoachCardsPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") redirect("/");

  const cards = await prisma.coachCard.findMany({
    include: { player: { select: { id: true, name: true, slug: true, photoPath: true, badges: true, pinnedBadges: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="page">
      <h1>Cartes Coach</h1>
      <AdminNav />
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Offre la carte Coach aux coachs d&apos;une édition. Elle arrive dans leur Collection : ils peuvent
        en faire leur carte affichée partout. Une seule par joueur — l&apos;attribuer à nouveau la met à jour.
        Pour tester, attribue-la-toi, active-la dans Mon compte → Collection, puis retire-la ici.
      </p>
      <CoachCardAdminPanel
        initialCards={cards.map((c) => ({
          playerId: c.playerId,
          tournament: c.tournament,
          city: c.city,
          collectorNumber: c.collectorNumber,
          player: { id: c.player.id, name: c.player.name, slug: c.player.slug, photoPath: c.player.photoPath, badges: (c.player.pinnedBadges?.length ? c.player.pinnedBadges : c.player.badges.slice(0, 5)) },
        }))}
      />
    </div>
  );
}
