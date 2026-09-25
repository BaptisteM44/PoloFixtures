/**
 * Stories de la home : une photo + légende, visible 24 h. L'admin peut en
 * épingler « à la une » sous un titre (ex. le nom d'un tournoi) : elles restent
 * alors visibles sans limite, regroupées par titre.
 */
import { prisma } from "@/lib/db";

export const STORY_TTL_MS = 24 * 3600_000;
export const STORY_CAPTION_MAX = 200;
export const STORIES_PER_DAY = 10;

export type StoryItem = {
  id: string;
  imagePath: string;
  caption: string | null;
  createdAt: string;
  author: { id: string; name: string; slug: string | null; photoPath: string | null };
  tournament: { id: string; slug: string | null; name: string } | null;
  highlightTitle: string | null;
};

export type StoryGroup = {
  key: string;
  kind: "highlight" | "author";
  title: string;
  cover: string | null; // avatar (auteur) ou 1re image (à la une)
  stories: StoryItem[];
};

const storySelect = {
  id: true, imagePath: true, caption: true, createdAt: true, highlightTitle: true,
  author: { select: { id: true, name: true, slug: true, photoPath: true } },
  tournament: { select: { id: true, slug: true, name: true } },
} as const;

type Row = Awaited<ReturnType<typeof prisma.story.findMany<{ select: typeof storySelect }>>>[number];
const toItem = (s: Row): StoryItem => ({ ...s, createdAt: s.createdAt.toISOString() });

/**
 * Groupes affichés sur la home : d'abord « à la une » (par titre, le plus
 * récemment épinglé en premier), puis les stories du jour par auteur (l'auteur
 * le plus récent en premier, le viewer lui-même en tête s'il en a posté).
 */
export async function loadStoryGroups(viewerId: string | null): Promise<StoryGroup[]> {
  const now = new Date();
  const [pinned, live] = await Promise.all([
    prisma.story.findMany({
      where: { highlightTitle: { not: null }, hiddenAt: null },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { ...storySelect, pinnedAt: true },
    }),
    prisma.story.findMany({
      where: { expiresAt: { gt: now }, hiddenAt: null },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: storySelect,
    }),
  ]);

  const highlights = new Map<string, { stories: StoryItem[]; lastPinned: number }>();
  for (const s of pinned) {
    const title = s.highlightTitle!;
    const g = highlights.get(title) ?? { stories: [], lastPinned: 0 };
    g.stories.push(toItem(s));
    g.lastPinned = Math.max(g.lastPinned, s.pinnedAt?.getTime() ?? 0);
    highlights.set(title, g);
  }
  const highlightGroups: StoryGroup[] = [...highlights.entries()]
    .sort((a, b) => b[1].lastPinned - a[1].lastPinned)
    .map(([title, g]) => ({ key: `h:${title}`, kind: "highlight", title, cover: g.stories[0]?.imagePath ?? null, stories: g.stories }));

  const byAuthor = new Map<string, StoryItem[]>();
  for (const s of live) {
    const list = byAuthor.get(s.author.id) ?? [];
    list.push(toItem(s));
    byAuthor.set(s.author.id, list);
  }
  const authorGroups: StoryGroup[] = [...byAuthor.values()]
    .sort((a, b) => {
      if (a[0].author.id === viewerId) return -1;
      if (b[0].author.id === viewerId) return 1;
      return Date.parse(b[b.length - 1].createdAt) - Date.parse(a[a.length - 1].createdAt);
    })
    .map((stories) => ({
      key: `a:${stories[0].author.id}`,
      kind: "author",
      title: stories[0].author.name,
      cover: stories[0].author.photoPath,
      stories,
    }));

  return [...highlightGroups, ...authorGroups];
}

/** Tournois proposés à l'auteur pour « lier » sa story : en cours, ou récents / proches. */
export async function storyTournamentOptions() {
  const now = Date.now();
  return prisma.tournament.findMany({
    where: {
      approved: true, hidden: false, testMode: false,
      dateStart: { lte: new Date(now + 14 * 86400_000) },
      dateEnd: { gte: new Date(now - 21 * 86400_000) },
    },
    orderBy: { dateStart: "desc" },
    take: 30,
    select: { id: true, name: true },
  });
}
