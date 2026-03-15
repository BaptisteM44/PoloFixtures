"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FollowButtonProps {
  tournamentId: string;
  initialFollowing: boolean;
  isLoggedIn: boolean;
}

export function FollowButton({ tournamentId, initialFollowing, isLoggedIn }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/follow`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setFollowing(data.following);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`follow-btn${following ? " follow-btn--active" : ""}`}
      title={following ? "Ne plus suivre ce tournoi" : "Suivre ce tournoi"}
      aria-label={following ? "Ne plus suivre ce tournoi" : "Suivre ce tournoi"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={following ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
