/**
 * 🧪 Bac à sable — création et pilotage de tournois fictifs sur le nouveau
 * moteur pipeline. Réservé aux organisateurs. Invisible du public, zéro
 * impact ELO/badges (testMode).
 */
import { unstable_noStore as noStore } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { PIPELINE_PRESETS } from "@/engine/presets";
import { SandboxHome } from "@/components/sandbox/SandboxHome";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SandboxPage() {
  noStore(); // jamais de rendu statique : la page dépend de la session
  const session = await auth();
  const playerId = session?.user?.playerId;

  // Phase de test privée : admin uniquement (+ email du propriétaire en secours)
  const ownerEmails = ["bapmorvan@gmail.com"];
  const email = (session?.user as { email?: string | null } | undefined)?.email?.toLowerCase();
  const allowed = !!playerId && (
    hasAtLeastRole(session?.user?.role, "ADMIN") || (!!email && ownerEmails.includes(email))
  );

  if (!allowed) {
    const t = await getTranslations("sandbox");
    return (
      <main className="container" style={{ padding: "48px 16px", textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>{t("title")}</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 12 }}>
          {t("private_notice")}
        </p>
      </main>
    );
  }

  const tournaments = await prisma.tournament.findMany({
    where: { creatorId: playerId, testMode: true, usesPipeline: true } as never,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, status: true, createdAt: true,
      teams: { select: { id: true } },
      stages: { orderBy: { order: "asc" }, select: { name: true, status: true } },
    } as never,
  }) as unknown as Array<{
    id: string; name: string; status: string; createdAt: Date;
    teams: Array<{ id: string }>;
    stages: Array<{ name: string; status: string }>;
  }>;

  const presets = PIPELINE_PRESETS.map((p) => ({
    key: p.key, label: p.label, description: p.description, minTeams: p.minTeams,
  }));

  return (
    <SandboxHome
      presets={presets}
      tournaments={tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        teamCount: t.teams.length,
        stages: t.stages,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
