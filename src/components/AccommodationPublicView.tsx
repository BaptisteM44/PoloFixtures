"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ContactModal } from "@/components/ContactModal";

type PersonInfo = {
  playerId: string;
  playerSlug: string | null;
  playerName: string;
  teamName: string;
  photoPath: string | null;
  hasAccount: boolean;
};

type AsGuest = {
  hostName: string;
  hostContact: string | null;
  hostPlayerId: string | null;
  hostPlayerSlug: string | null;
  hostHasAccount: boolean;
  coGuests: PersonInfo[];
};
type AsHost = { hostId: string; name: string; contact: string | null; guests: PersonInfo[] };

type MyAccommodation = {
  role: "none" | "guest" | "host";
  asGuest?: AsGuest | null;
  asHost?: AsHost | null;
  myPlayerId?: string;
};

/** Ligne joueur : photo, nom cliquable vers le profil, bouton message si possible. */
function PersonRow({ person, canContact, size = 32 }: { person: PersonInfo; canContact: boolean; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg-muted)", borderRadius: 8, flexWrap: "wrap" }}>
      {person.photoPath && <Image src={person.photoPath} alt={person.playerName} width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover" }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/player/${person.playerSlug ?? person.playerId}`} style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "underline" }}>
          {person.playerName}
        </Link>
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{person.teamName}</p>
      </div>
      {canContact && person.hasAccount && <ContactModal recipientId={person.playerId} recipientName={person.playerName} />}
    </div>
  );
}

export function AccommodationPublicView({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("tournament");
  const [data, setData] = useState<MyAccommodation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/accommodation/my`)
      .then((r) => r.ok ? r.json() : { role: "none" })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData({ role: "none" }); setLoading(false); });
  }, [tournamentId]);

  if (loading) return <p className="meta" style={{ padding: 24, textAlign: "center" }}>{t("accommodation_loading")}</p>;
  if (!data || data.role === "none") {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("accommodation_none_title")}</p>
        <p className="meta" style={{ fontSize: 12, marginTop: 8 }}>{t("accommodation_none_desc")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* As guest */}
      {data.asGuest && (
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontFamily: "var(--font-display)", fontSize: 16 }}>{t("accommodation_your_host")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{t("accommodation_host_label")}</strong>{" "}
                {data.asGuest.hostPlayerId ? (
                  <Link href={`/player/${data.asGuest.hostPlayerSlug ?? data.asGuest.hostPlayerId}`} style={{ color: "var(--text)", textDecoration: "underline" }}>
                    {data.asGuest.hostName}
                  </Link>
                ) : data.asGuest.hostName}
              </p>
              {data.asGuest.hostPlayerId && data.asGuest.hostHasAccount && data.asGuest.hostPlayerId !== data.myPlayerId && (
                <ContactModal recipientId={data.asGuest.hostPlayerId} recipientName={data.asGuest.hostName} />
              )}
            </div>
            {data.asGuest.hostContact && (
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>{t("accommodation_contact_label")}</strong>{" "}
                <a href={data.asGuest.hostContact.startsWith("http") ? data.asGuest.hostContact : `mailto:${data.asGuest.hostContact}`} style={{ color: "var(--teal)" }}>
                  {data.asGuest.hostContact}
                </a>
              </p>
            )}
          </div>
          {data.asGuest.coGuests.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                {t("accommodation_co_guests", { hostName: data.asGuest.hostName })}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.asGuest.coGuests.map((g) => (
                  <PersonRow key={g.playerId} person={g} canContact size={28} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* As host */}
      {data.asHost && (
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 16 }}>{t("accommodation_you_host")}</h3>
          <p className="meta" style={{ margin: "0 0 12px", fontSize: 12 }}>
            {t("accommodation_guest_count", { count: data.asHost.guests.length, plural: data.asHost.guests.length !== 1 ? "s" : "" })}
          </p>
          {data.asHost.guests.length === 0 ? (
            <p className="meta" style={{ fontSize: 13 }}>{t("accommodation_no_guests")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.asHost.guests.map((g) => (
                <PersonRow key={g.playerId} person={g} canContact={g.playerId !== data.myPlayerId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
