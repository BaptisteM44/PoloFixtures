import { prisma } from "@/lib/db";
import { OverlayControlCenter } from "@/components/OverlayControlCenter";

export const dynamic = "force-dynamic";

export default async function OverlayDownoverPage() {
  const [channels, tournaments] = await Promise.all([
    prisma.overlayChannel.findMany({
      include: { tournament: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tournament.findMany({
      where: { status: { in: ["UPCOMING", "LIVE"] }, hidden: false },
      select: { id: true, name: true, status: true },
      orderBy: { dateStart: "asc" },
    }),
  ]);

  return (
    <div className="container" style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>Overlay Control Center</h1>
        <p className="meta">
          Créez des canaux avec une URL fixe pour OBS. Changez le tournoi assigné sans jamais retoucher l'URL.
        </p>
      </div>
      <OverlayControlCenter initialChannels={channels} tournaments={tournaments} />
    </div>
  );
}
