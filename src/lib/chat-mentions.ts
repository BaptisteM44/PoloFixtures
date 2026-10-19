import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";

export type ChatKind = "team" | "tournament" | "squad" | "club" | "session";
export type ChatPerson = { id: string; name: string };

type Audience = { people: ChatPerson[]; context: string; href: string };

const uniq = (people: ChatPerson[]) => {
  const seen = new Map<string, ChatPerson>();
  for (const p of people) if (p.name?.trim() && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name.trim() });
  return [...seen.values()];
};

/**
 * Personnes qu'on peut @mentionner dans un chat (= celles qui y ont accès),
 * avec le nom du chat et son lien pour la notification. null si le chat
 * n'existe pas ou que `viewerId` n'y a pas accès.
 */
export async function getChatAudience(kind: ChatKind, id: string, viewerId: string): Promise<Audience | null> {
  if (kind === "team") {
    const team = await prisma.team.findUnique({
      where: { id },
      select: { name: true, players: { select: { player: { select: { id: true, name: true } } } } },
    });
    if (!team) return null;
    const people = team.players.map((tp) => tp.player);
    if (!people.some((p) => p.id === viewerId)) return null;
    return { people: uniq(people), context: team.name, href: "/my-tournaments" };
  }

  if (kind === "tournament") {
    const t = await prisma.tournament.findUnique({
      where: { id },
      select: {
        name: true, slug: true,
        creator: { select: { id: true, name: true } },
        coOrganizers: { select: { player: { select: { id: true, name: true } } } },
        teams: { select: { players: { select: { player: { select: { id: true, name: true } } } } } },
        soloEntries: { select: { player: { select: { id: true, name: true } } } },
      },
    });
    if (!t) return null;
    const people = [
      ...(t.creator ? [t.creator] : []),
      ...t.coOrganizers.map((c) => c.player),
      ...t.teams.flatMap((tm) => tm.players.map((tp) => tp.player)),
      ...t.soloEntries.map((s) => s.player),
    ];
    return { people: uniq(people), context: t.name, href: `/tournament/${t.slug ?? id}?tab=chat` };
  }

  if (kind === "squad") {
    const squad = await prisma.squad.findUnique({
      where: { id },
      select: { name: true, members: { select: { player: { select: { id: true, name: true } } } } },
    });
    if (!squad) return null;
    const people = squad.members.map((m) => m.player);
    if (!people.some((p) => p.id === viewerId)) return null;
    return { people: uniq(people), context: squad.name, href: `/my-teams/${id}` };
  }

  // Club et séances d'entraînement : les membres du club.
  const clubId = kind === "club"
    ? id
    : (await prisma.clubSession.findUnique({ where: { id }, select: { clubId: true } }))?.clubId;
  if (!clubId) return null;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true, members: { where: { status: "MEMBER" }, select: { player: { select: { id: true, name: true } } } } },
  });
  if (!club) return null;
  const people = club.members.map((m) => m.player);
  if (!people.some((p) => p.id === viewerId)) return null;
  return {
    people: uniq(people),
    context: kind === "club" ? club.name : `🚲 ${club.name}`,
    href: `/club/${clubId}?tab=${kind === "club" ? "chat" : "sessions"}`,
  };
}

/** Personnes mentionnées « @Nom » dans le message (nom entier, insensible à la casse). */
export function findMentions(content: string, people: ChatPerson[]): ChatPerson[] {
  const text = content.toLowerCase();
  // Les noms les plus longs d'abord : « @Léa Martin » ne doit pas aussi compter « @Léa ».
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  const claimed: Array<[number, number]> = [];
  const hits: ChatPerson[] = [];
  for (const p of sorted) {
    const needle = "@" + p.name.toLowerCase();
    let from = 0;
    while (true) {
      const at = text.indexOf(needle, from);
      if (at === -1) break;
      from = at + 1;
      const end = at + needle.length;
      const next = text.charAt(end);
      if (next && /[\p{L}\p{N}_]/u.test(next)) continue; // « @Léa » dans « @Léandre »
      if (claimed.some(([s, e]) => at >= s && at < e)) continue;
      claimed.push([at, end]);
      hits.push(p);
      break;
    }
  }
  return hits;
}

/** Notifie les personnes @mentionnées dans un message (jamais l'auteur). */
export async function notifyMentions(kind: ChatKind, id: string, senderId: string, content: string): Promise<void> {
  try {
    if (!content.includes("@")) return;
    const audience = await getChatAudience(kind, id, senderId);
    if (!audience) return;
    const mentioned = findMentions(content, audience.people).filter((p) => p.id !== senderId);
    if (mentioned.length === 0) return;
    const sender = audience.people.find((p) => p.id === senderId)?.name
      ?? (await prisma.player.findUnique({ where: { id: senderId }, select: { name: true } }))?.name ?? "";
    const preview = content.length > 120 ? content.slice(0, 117) + "…" : content;
    for (const p of mentioned) {
      await createNotification(p.id, "CHAT_MENTION", { senderName: sender, context: audience.context, preview, href: audience.href });
    }
  } catch (e) {
    console.error("[mentions]", kind, id, e);
  }
}
