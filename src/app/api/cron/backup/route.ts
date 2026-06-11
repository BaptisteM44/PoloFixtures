import { prisma } from "@/lib/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const maxDuration = 60;

export async function GET(request: Request) {
  // Sécurité : token Bearer requis
  const authHeader = request.headers.get("authorization");
  const isValidSecret = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isValidSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [
    players, tournaments, teams, matches, pools, freeAgents, sponsors,
    teamMessages, tournamentMessages, squadMessages, directConversations, directMessages,
  ] = await Promise.all([
    prisma.player.findMany(),
    prisma.tournament.findMany(),
    prisma.team.findMany({ include: { players: true } }),
    prisma.match.findMany({ include: { events: true } }),
    prisma.pool.findMany({ include: { teams: true } }),
    prisma.freeAgent.findMany(),
    prisma.sponsor.findMany(),
    prisma.teamMessage.findMany(),
    prisma.tournamentMessage.findMany(),
    prisma.squadMessage.findMany(),
    prisma.directConversation.findMany(),
    prisma.directMessage.findMany(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    players,
    tournaments,
    teams,
    matches,
    pools,
    freeAgents,
    sponsors,
    teamMessages,
    tournamentMessages,
    squadMessages,
    directConversations,
    directMessages,
  };

  const json = JSON.stringify(backup, null, 2);
  const filename = `backups/backup_${new Date().toISOString().slice(0, 10)}.json`;

  try {
    await r2.send(new PutObjectCommand({
      Bucket: "uploads",
      Key: filename,
      Body: Buffer.from(json),
      ContentType: "application/json",
    }));
  } catch (err) {
    console.error("Backup upload error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }

  return Response.json({
    ok: true,
    filename,
    counts: {
      players: players.length,
      tournaments: tournaments.length,
      teams: teams.length,
      matches: matches.length,
      teamMessages: teamMessages.length,
      tournamentMessages: tournamentMessages.length,
      squadMessages: squadMessages.length,
      directConversations: directConversations.length,
      directMessages: directMessages.length,
    },
  });
}
