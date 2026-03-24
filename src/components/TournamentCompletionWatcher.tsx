"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TournamentCompletionWatcher({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource(`/api/sse?tournamentId=${tournamentId}`);
    es.addEventListener("tournament", (event) => {
      const payload = JSON.parse((event as MessageEvent).data);
      if (payload?.type === "tournament_completed") {
        router.refresh();
      }
    });
    return () => es.close();
  }, [tournamentId, router]);

  return null;
}
