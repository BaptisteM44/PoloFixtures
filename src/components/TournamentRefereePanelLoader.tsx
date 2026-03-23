"use client";

import dynamic from "next/dynamic";

const TournamentRefereePanel = dynamic(
  () => import("./TournamentRefereePanel").then((m) => m.TournamentRefereePanel),
  { ssr: false, loading: () => <div style={{ padding: 40, textAlign: "center" }}>Chargement du panneau arbitrage…</div> }
);

export { TournamentRefereePanel };
