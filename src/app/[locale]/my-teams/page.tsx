import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { CreateSquadForm } from "@/components/CreateSquadForm";

export default async function MyTeamsPage() {
  const t = await getTranslations("my_teams");
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) redirect("/login");

  const squads = await prisma.squad.findMany({
    where: { members: { some: { playerId } } },
    include: {
      members: {
        include: { player: { select: { id: true, name: true, photoPath: true, country: true } } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const myRole = (squadId: string) =>
    squads.find((s) => s.id === squadId)?.members.find((m) => m.playerId === playerId)?.role;

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t("page_title")}</h1>
          <p className="meta">{t("page_subtitle")}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* Liste des squads */}
        <div style={{ display: "grid", gap: 16 }}>
          {squads.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 48 }}>
              <p style={{ fontSize: 32, margin: "0 0 12px" }}>🏑</p>
              <h3 style={{ margin: "0 0 8px" }}>{t("empty_title")}</h3>
              <p className="meta">{t("empty_subtitle")}</p>
            </div>
          ) : (
            squads.map((squad) => {
              const role = myRole(squad.id);
              const captain = squad.members.find((m) => m.role === "CAPTAIN");
              return (
                <Link
                  key={squad.id}
                  href={`/my-teams/${squad.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <div className="panel squad-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {/* Color dot / logo */}
                      <div style={{
                        width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                        background: squad.color ?? "var(--teal)",
                        border: "2px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22,
                      }}>
                        {squad.logoPath ? (
                          <img src={squad.logoPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                        ) : "🏑"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{squad.name}</strong>
                          {role === "CAPTAIN" && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--yellow)", border: "1.5px solid var(--border)" }}>CAP</span>
                          )}
                        </div>
                        <p className="meta" style={{ margin: "2px 0 0" }}>
                          {squad.members.length} membre{squad.members.length > 1 ? "s" : ""}
                          {captain && ` · Cap : ${captain.player.name}`}
                        </p>
                      </div>
                      {/* Avatars */}
                      <div style={{ display: "flex", marginLeft: "auto" }}>
                        {squad.members.slice(0, 4).map((m, i) => (
                          <div key={m.player.id} style={{
                            width: 30, height: 30, borderRadius: "50%",
                            border: "2px solid var(--bg)",
                            marginLeft: i === 0 ? 0 : -8,
                            background: "var(--surface-2)",
                            overflow: "hidden",
                            zIndex: squad.members.length - i,
                          }}>
                            {m.player.photoPath ? (
                              <img src={m.player.photoPath} alt={m.player.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
                                {m.player.name[0]}
                              </div>
                            )}
                          </div>
                        ))}
                        {squad.members.length > 4 && (
                          <div style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--bg)", marginLeft: -8, background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>
                            +{squad.members.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                    {squad.bio && (
                      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-muted)", borderTop: "1px solid var(--border-light)", paddingTop: 10 }}>
                        {squad.bio}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Formulaire de création */}
        <div style={{ position: "sticky", top: 80 }}>
          <div className="panel">
            <h3 style={{ marginBottom: 16 }}>{t("create_title")}</h3>
            <CreateSquadForm />
          </div>
        </div>
      </div>
    </div>
  );
}
