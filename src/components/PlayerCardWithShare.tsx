"use client";

import { useRef } from "react";
import { PlayerCollectibleCard } from "@/components/PlayerCollectibleCard";
import { ShareCardButton } from "@/components/ShareCardButton";

type Props = React.ComponentProps<typeof PlayerCollectibleCard> & {
  canShare?: boolean;
};

export function PlayerCardWithShare({ canShare = false, ...cardProps }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <PlayerCollectibleCard ref={cardRef} {...cardProps} />
      {canShare && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <ShareCardButton cardRef={cardRef} playerName={cardProps.name} />
        </div>
      )}
    </div>
  );
}
