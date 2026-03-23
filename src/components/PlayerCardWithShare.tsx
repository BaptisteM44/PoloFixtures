"use client";

import { useRef } from "react";
import { PokemonCard } from "@/components/PokemonCard";
import { ShareCardButton } from "@/components/ShareCardButton";

type Props = React.ComponentProps<typeof PokemonCard> & {
  canShare?: boolean;
};

export function PlayerCardWithShare({ canShare = false, ...cardProps }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <PokemonCard ref={cardRef} {...cardProps} />
      {canShare && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <ShareCardButton cardRef={cardRef} playerName={cardProps.name} />
        </div>
      )}
    </div>
  );
}
