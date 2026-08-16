import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { randomBytes } from "crypto";
import { hashPlayerVoter, hashGuestVoter } from "@/lib/poll-hash";
import { isPollOpen, validateChoices, castVote, type PollLite } from "@/lib/poll-vote";
import { isRateLimited, getIp } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mailer";
import { SITE_URL } from "@/lib/site-url";

const voteSchema = z.object({
  choices: z.array(z.string()).min(1).max(20),
  // Champs guest (ignorés si l'utilisateur est connecté)
  email: z.string().email().max(160).optional(),
  guestInfo: z.record(z.string()).optional(), // { key: value } du formulaire libre
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const poll = (await prisma.poll.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, options: true, multipleChoice: true, openAt: true, closeAt: true, allowGuests: true },
  })) as (PollLite & { allowGuests: boolean }) | null;

  if (!poll) return new Response("Sondage introuvable", { status: 404 });
  if (!isPollOpen(poll)) return Response.json({ error: "closed" }, { status: 409 });

  const json = await request.json();
  const parsed = voteSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const { choices, email, guestInfo } = parsed.data;

  const choiceError = validateChoices(poll, choices);
  if (choiceError) return Response.json({ error: "invalid", detail: choiceError }, { status: 400 });

  const session = await auth();
  const playerId = session?.user?.playerId;

  // ── Cas 1 : votant INSCRIT (connecté) — vote direct, pas de formulaire ──
  if (playerId) {
    const voterHash = hashPlayerVoter(poll.id, playerId);
    const res = await castVote({ pollId: poll.id, voterHash, choices, isGuest: false, verified: true });
    if (!res.ok && res.reason === "already_voted") {
      return Response.json({ error: "already_voted" }, { status: 409 });
    }
    return Response.json({ ok: true, mode: "registered" });
  }

  // ── Cas 2 : votant GUEST — email obligatoire + confirmation par mail ──
  if (!poll.allowGuests) {
    return Response.json({ error: "guests_not_allowed" }, { status: 403 });
  }
  if (!email) {
    return Response.json({ error: "email_required" }, { status: 400 });
  }
  // Rate-limit par IP : anti-spam d'emails de confirmation.
  if (isRateLimited(`poll-vote:${getIp(request)}`, 5, 10 * 60 * 1000)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const voterHash = hashGuestVoter(poll.id, email);

  // Déjà émargé pour ce sondage ? (a déjà voté OU a une confirmation en attente)
  const existing = await prisma.pollVoter.findUnique({
    where: { pollId_voterHash: { pollId: poll.id, voterHash } },
    select: { verified: true },
  });
  if (existing) {
    // verified = a déjà voté ; non-verified = un mail de confirmation est déjà parti.
    return Response.json({ error: existing.verified ? "already_voted" : "verification_pending" }, { status: 409 });
  }

  // On NE dépose PAS le bulletin maintenant : on crée un émargement NON vérifié
  // qui garde le choix en attente. Le bulletin ne sera déposé qu'à la
  // confirmation du mail (évite qu'un email bidon fasse voter sans confirmer).
  const token = randomBytes(32).toString("hex");
  await prisma.pollVoter.create({
    data: {
      pollId: poll.id,
      voterHash,
      isGuest: true,
      verified: false,
      verifyToken: token,
      verifyExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
      guestInfo: guestInfo ?? undefined,
      pendingChoice: choices,
    },
  });

  // Envoi du mail de confirmation (fire-and-forget : un échec SMTP ne doit pas
  // faire échouer la requête — l'émargement en attente reste, réessayable).
  const confirmUrl = `${SITE_URL}/api/polls/${poll.id}/verify?token=${token}`;
  sendMail({
    to: email,
    subject: "Confirme ton vote — Poloperator",
    html: `
      <p>Merci de participer au sondage de la communauté bike polo.</p>
      <p>Pour valider ton vote, clique sur ce lien (valable 48h) :</p>
      <p><a href="${confirmUrl}" style="color:#60c9cf;font-weight:bold;">Confirmer mon vote</a></p>
      <p style="color:#888;font-size:12px;">Si tu n'as pas voté, ignore ce message.</p>
    `,
  }).catch((e) => console.error("[poll] confirmation mail failed:", e));

  return Response.json({ ok: true, mode: "guest_pending" });
}
