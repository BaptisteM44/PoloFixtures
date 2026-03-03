"use client";

type Props = {
  telegramUrl: string;
};

export function TelegramWidget({ telegramUrl }: Props) {
  return (
    <div
      className="panel info-tile--telegram"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        padding: "28px 20px",
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#229ED9"/>
        <path d="M5.5 11.5l10-4-3.5 10-2-3.5-4.5-2.5z" fill="white" opacity="0.25"/>
        <path d="M9.5 14l-.5 3.5 1.5-1.5 2 1.5 3.5-10-10 4 3 1.5z" fill="white"/>
      </svg>
      <div>
        <p style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
          Groupe Telegram
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Rejoins le groupe du tournoi pour suivre les annonces et discuter avec les participants
        </p>
      </div>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="primary"
        style={{ fontSize: 13, padding: "9px 20px", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        Rejoindre →
      </a>
    </div>
  );
}
