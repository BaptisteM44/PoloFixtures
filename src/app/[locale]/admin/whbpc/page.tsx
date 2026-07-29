import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { WhbpcAdminPanel } from "@/components/admin/WhbpcAdminPanel";
import { redirect } from "next/navigation";

export default async function AdminWhbpcPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const cards = await prisma.whbpcCard.findMany({
    include: { player: { select: { id: true, name: true, slug: true, photoPath: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="page">
      <h1>Cartes WHBPC</h1>
      <AdminNav />
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Attribue la carte souvenir WHBPC (tournoi hors plateforme) aux joueurs qui y ont participé.
        Elle apparaît uniquement dans leur Collection, pas pour les autres.
      </p>
      <WhbpcAdminPanel
        initialCards={cards.map((c) => ({
          id: c.id,
          playerId: c.playerId,
          teamName: c.teamName,
          yearStarted: c.yearStarted,
          countryCode: c.countryCode,
          bestSkill: c.bestSkill,
          pedals: c.pedals,
          hand: c.hand as "RIGHTIE" | "LEFTIE",
          wheelSize: c.wheelSize,
          gearRatio: c.gearRatio,
          player: c.player,
        }))}
      />
    </div>
  );
}
