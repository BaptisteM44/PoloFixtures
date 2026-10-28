/**
 * Petites icônes en pixel art (SVG net, sans flou) pour les écrans de salle :
 *  - « court » : un terrain de bike polo vu de dessus (bandes, cages, ligne médiane) ;
 *  - « tv »    : un écran sur pied.
 * Dessinées sur une grille ; chaque pixel = un <rect> de 1×1.
 */

type Px = [x: number, y: number, w: number, h: number, fill: string];

const BOARD = "#1a1a1a"; // bandes
const FLOOR = "#7d8794"; // bitume
const LINE = "#f6f6f0"; // lignes
const GOAL = "#ffa2af"; // cages
const SCREEN = "#60c9cf";
const SHINE = "#bfeef0";

// Terrain 22×13 : coins arrondis en escalier, cages au milieu des petits côtés.
const COURT: Px[] = [
  // bandes (contour, coins coupés)
  [2, 0, 18, 1, BOARD], [2, 12, 18, 1, BOARD],
  [0, 2, 1, 9, BOARD], [21, 2, 1, 9, BOARD],
  [1, 1, 1, 1, BOARD], [20, 1, 1, 1, BOARD], [1, 11, 1, 1, BOARD], [20, 11, 1, 1, BOARD],
  // sol
  [2, 1, 18, 11, FLOOR], [1, 2, 1, 9, FLOOR], [20, 2, 1, 9, FLOOR],
  // ligne médiane + rond central
  [11, 1, 1, 11, LINE], [10, 5, 1, 1, LINE], [12, 5, 1, 1, LINE], [10, 7, 1, 1, LINE], [12, 7, 1, 1, LINE], [9, 6, 1, 1, LINE], [13, 6, 1, 1, LINE],
  // lignes de cage (zones)
  [4, 4, 1, 5, LINE], [17, 4, 1, 5, LINE],
  // cages
  [2, 5, 1, 3, GOAL], [1, 5, 1, 3, BOARD], [19, 5, 1, 3, GOAL], [20, 5, 1, 3, BOARD],
];

// TV 16×14 : cadre, écran avec reflet, pied.
const TV: Px[] = [
  [0, 0, 16, 1, BOARD], [0, 10, 16, 1, BOARD], [0, 1, 1, 9, BOARD], [15, 1, 1, 9, BOARD],
  [1, 1, 14, 9, SCREEN],
  [2, 2, 3, 1, SHINE], [2, 3, 1, 2, SHINE],
  [7, 11, 2, 1, BOARD], [4, 12, 8, 1, BOARD], [3, 13, 10, 1, BOARD],
];

const SHAPES = { court: { w: 22, h: 13, px: COURT }, tv: { w: 16, h: 14, px: TV } } as const;

export function PixelIcon({ kind, size = 32, title }: { kind: keyof typeof SHAPES; size?: number; title?: string }) {
  const s = SHAPES[kind];
  return (
    <svg
      width={size}
      height={(size * s.h) / s.w}
      viewBox={`0 0 ${s.w} ${s.h}`}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: "block", imageRendering: "pixelated" }}
    >
      {s.px.map(([x, y, w, h, fill], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />)}
    </svg>
  );
}
