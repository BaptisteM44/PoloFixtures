"use client";

import { useRef } from "react";
import { PokemonCard } from "@/components/PokemonCard";
import { ShareCardButton } from "@/components/ShareCardButton";

type Props = React.ComponentProps<typeof PokemonCard>;

export function PlayerCardWithShare(props: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <PokemonCard ref={cardRef} {...props} />
      <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
        <ShareCardButton cardRef={cardRef} playerName={props.name} />
      </div>
    </div>
  );
}
