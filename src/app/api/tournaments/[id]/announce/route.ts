import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAtLeastRole } from "@/lib/rbac";
import { sendMail, isMailerConfigured } from "@/lib/mailer";
import { getLangFromCountry, announceEmail } from "@/lib/email-templates";
import { z } from "zod";

const schema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(5000),
  playerIds: z.array(z.string()).min(1).max(1000),
});

/** Destinataire possible d'une annonce. L'email ne quitte jamais le serveur. */
type Candidate = {
  playerId: string;
  name: string;
  email: string | null;
  active: boolean;
  country: string | null;
  isCaptain: boolean;
  groupId: string;
  groupName: string;
  inSelection: boolean;
  feePaid: boolean;
  needsAccommodation: boolean;
  /** Libellé dans l'email (« Message de l'organisation · {label} »). */
  label: string;
};

async function orgaTournament(tournamentId: string) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  const role = session?.user?.role;
  if (!playerId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, slug: true, format: true, creatorId: true, coOrganizers: { select: { playerId: true } } },
  });
  if (!tournament) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const isOrga =
    (role && hasAtLeastRole(role, "ADMIN")) ||
    tournament.creatorId === playerId ||
    tournament.coOrganizers.some((co) => co.playerId === playerId);
  if (!isOrga) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { tournament };
}

/**
 * Tous les destinataires possibles. ABC Chapeau : les inscriptions
 * individuelles (groupées par équipe après le tirage). Autres formats : les
 * joueur·euses de toutes les équipes, IN comme liste d'attente.
 */
async function loadCandidates(tournamentId: string, format: string): Promise<Candidate[]> {
  const playerSelect = { id: true, name: true, status: true, country: true, account: { select: { email: true } } } as const;

  if (format === "ABC Chapeau") {
    const entries = await prisma.tournamentSoloEntry.findMany({
      where: { tournamentId },
      include: { player: { select: playerSelect }, team: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return entries.map((e) => ({
      playerId: e.player.id,
      name: e.player.name,
      email: e.player.account?.email || null,
      active: e.player.status === "ACTIVE",
      country: e.player.country,
      isCaptain: false,
      groupId: e.team?.id ?? (e.waitlisted ? "waitlist" : "registered"),
      groupName: e.team?.name ?? "",
      inSelection: !e.waitlisted,
      feePaid: e.feePaid,
      needsAccommodation: false,
      label: e.player.name,
    }));
  }

  const teamPlayers = await prisma.teamPlayer.findMany({
    where: { team: { tournamentId } },
    include: {
      player: { select: playerSelect },
      team: { select: { id: true, name: true, selected: true, feePaid: true, seed: true } },
    },
    orderBy: [{ team: { seed: "asc" } }, { registeredAt: "asc" }],
  });
  return teamPlayers.map((tp) => ({
    playerId: tp.player.id,
    name: tp.player.name,
    email: tp.player.account?.email || null,
    active: tp.player.status === "ACTIVE",
    country: tp.player.country,
    isCaptain: tp.isCaptain,
    groupId: tp.team.id,
    groupName: tp.team.name,
    inSelection: tp.team.selected,
    feePaid: tp.team.feePaid,
    needsAccommodation: tp.needsAccommodation,
    label: tp.team.name,
  }));
}

// GET : liste des destinataires possibles (sans les emails) pour le panneau.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { tournament, error } = await orgaTournament(params.id);
  if (error) return error;
  const candidates = await loadCandidates(tournament.id, tournament.format);
  return NextResponse.json({
    isSolo: tournament.format === "ABC Chapeau",
    // Email visible de l'orga (route réservée) : bouton « Copier les emails »,
    // pour écrire depuis sa propre messagerie quand l'envoi groupé coince.
    recipients: candidates.map(({ email, active, country: _country, label: _label, ...c }) => ({
      ...c,
      email: active ? email : null,
      reachable: !!email && active,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { tournament, error } = await orgaTournament(params.id);
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Service email indisponible : on refuse explicitement au lieu de "réussir"
  // sans rien envoyer (sendMail ignore silencieusement si SMTP non configuré).
  if (!isMailerConfigured()) {
    return NextResponse.json({ error: "mailer_unavailable" }, { status: 503 });
  }

  const { subject, message, playerIds } = parsed.data;
  // Seuls les joueurs réellement liés au tournoi peuvent être ciblés : la liste
  // envoyée par le navigateur est filtrée contre les candidats du serveur.
  const wanted = new Set(playerIds);
  const seen = new Set<string>();
  const recipients = (await loadCandidates(tournament.id, tournament.format)).filter((c) => {
    if (!wanted.has(c.playerId) || seen.has(c.playerId)) return false;
    seen.add(c.playerId);
    return true;
  });

  const messageHtml = message.replace(/\n/g, "<br>");
  const appUrl = process.env.NEXTAUTH_URL ?? "https://poloperator.com";
  const tournamentUrl = `${appUrl}/tournament/${tournament.slug ?? tournament.id}`;

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const failedPlayerIds: string[] = [];
  // Raison renvoyée par le serveur mail au 1er échec (ex: « EAUTH 535 … ») :
  // affichée à l'orga, sinon un échec reste invisible sans les logs serveur.
  let failReason: string | null = null;

  for (const r of recipients) {
    if (!r.email || !r.active) { skipped++; continue; }

    const lang = getLangFromCountry(r.country as any);
    const { subject: emailSubject, html } = announceEmail(lang, {
      tournamentName: tournament.name,
      tournamentUrl,
      subject,
      messageHtml,
      recipientLabel: r.label,
    });

    try {
      await sendMail({ to: r.email, subject: emailSubject, html });
      sent++;
    } catch (err) {
      errors.push(r.email);
      failedPlayerIds.push(r.playerId);
      if (!failReason) {
        const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
        failReason = [e.code, e.responseCode, e.response ?? e.message].filter(Boolean).join(" ").slice(0, 200) || null;
      }
      // Login refusé ou serveur injoignable : insister multiplierait les
      // tentatives de connexion, exactement ce qui fait bloquer le compte.
      const code = (err as { code?: string })?.code;
      if (code === "EAUTH" || code === "ECONNECTION" || code === "ETIMEDOUT") break;
    }
  }

  return NextResponse.json({ ok: true, sent, errors, skipped, failReason, failedPlayerIds });
}
