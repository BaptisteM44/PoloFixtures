import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isRateLimited } from "@/lib/rate-limit";
import { notifyAllAdmins } from "@/lib/notify";

const reportSchema = z.object({ reason: z.string().trim().min(5).max(500) });

/** Signale un sondage tendancieux à l'admin — inscrits uniquement, un signalement par personne. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return Response.json({ error: "login_required" }, { status: 401 });

  if (isRateLimited(`poll-report:${playerId}`, 10, 60 * 60 * 1000)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = reportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const poll = await prisma.poll.findUnique({
    where: { id: params.id },
    select: { id: true, question: true, createdById: true, status: true },
  });
  if (!poll || poll.status === "DRAFT") return new Response("Sondage introuvable", { status: 404 });
  if (poll.createdById === playerId) return Response.json({ error: "own_poll" }, { status: 400 });

  try {
    await prisma.pollReport.create({
      data: { pollId: poll.id, reporterId: playerId, reason: parsed.data.reason },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "already_reported" }, { status: 409 });
    }
    throw e;
  }

  await notifyAllAdmins("POLL_REPORTED", {
    pollId: poll.id,
    pollQuestion: poll.question.slice(0, 120),
    reporterName: session.user?.name ?? "",
    reason: parsed.data.reason.slice(0, 200),
  });

  return Response.json({ ok: true });
}
