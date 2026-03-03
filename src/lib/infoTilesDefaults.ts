import type { LayoutItem } from "react-grid-layout";

export const INFO_TILE_KEYS = [
  "logistique",
  "poster",
  "liens",
  "stream",
  "chat",
  "livematch",
] as const;

export type InfoTileKey = (typeof INFO_TILE_KEYS)[number];

/** Layout par défaut — reproduit le layout CSS historique (3 colonnes) */
export const DEFAULT_INFO_TILES_LAYOUT: LayoutItem[] = [
  { i: "logistique", x: 0, y: 0, w: 2, h: 4, minW: 1, minH: 2 },
  { i: "poster", x: 2, y: 0, w: 1, h: 6, minW: 1, minH: 2 },
  { i: "liens", x: 0, y: 4, w: 1, h: 3, minW: 1, minH: 2 },
  { i: "stream", x: 0, y: 7, w: 1, h: 4, minW: 1, minH: 3 },
  { i: "chat", x: 2, y: 6, w: 1, h: 5, minW: 1, minH: 3 },
  { i: "livematch", x: 1, y: 4, w: 1, h: 3, minW: 1, minH: 2 },
];
