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
        Offre la carte Coach aux coachs de l&apos;édition. Le joueur est prévenu par une notification et la
        retrouve dans sa Collection, d&apos;où il peut en faire sa carte affichée partout.
        Pour tester, donne-la-toi, active-la dans Mon compte → Collection, puis retire-la ici.
      </p>
      <CoachCardAdminPanel
        initialCards={cards.map((c) => ({
          playerId: c.playerId,
          collectorNumber: c.collectorNumber,
          player: { id: c.player.id, name: c.player.name, slug: c.player.slug, photoPath: c.player.photoPath, badges: (c.player.pinnedBadges?.length ? c.player.pinnedBadges : c.player.badges.slice(0, 5)) },
        }))}
      />
    </div>
  );
}
