import { prisma } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // List all files in uploads bucket (images, photos, banners, etc.)
  const { data: uploadedFiles } = await supabase.storage
    .from("uploads")
    .list("", { limit: 10000 });

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
    uploadedFiles: uploadedFiles || [],
  };

  const json = JSON.stringify(backup, null, 2);
  const filename = `backups/backup_${new Date().toISOString().slice(0, 10)}.json`;

  const { error } = await supabase.storage
    .from("uploads")
    .upload(filename, Buffer.from(json), {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    console.error("Backup upload error:", error);
    return Response.json({ error: error.message }, { status: 500 });
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
      uploadedFiles: uploadedFiles?.length || 0,
    },
  });
}
