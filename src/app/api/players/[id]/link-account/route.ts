import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

// POST /api/players/:id/link-account
// Body: { email: string }
// Links a User account to a Player profile (orga or admin only)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const isAdmin = session.user.role === "ADMIN";
  const playerId = (session.user as { playerId?: string }).playerId;

  // Must be admin or an orga of a tournament that contains this player
  if (!isAdmin) {
    const playerInOrgaTournament = await prisma.teamPlayer.findFirst({
      where: {
        playerId: params.id,
        team: {
          tournament: {
            OR: [
              { creatorId: playerId ?? "" },
              { coOrganizers: { some: { playerId: playerId ?? "" } } },
            ],
          },
        },
      },
    });
    if (!playerInOrgaTournament) return new Response("Forbidden", { status: 403 });
  }

  const { email } = await request.json();
  if (!email?.trim()) return Response.json({ error: "Email requis" }, { status: 400 });

  // Find the user by email
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return Response.json({ error: "Aucun compte trouvé avec cet email" }, { status: 404 });

  // Check if user already linked to another player
  if (user.playerId && user.playerId !== params.id) {
    return Response.json({ error: "Ce compte est déjà lié à un autre profil joueur" }, { status: 409 });
  }

  // Check if player already linked to another user
  const existingLink = await prisma.user.findFirst({ where: { playerId: params.id } });
  if (existingLink && existingLink.id !== user.id) {
    return Response.json({ error: "Ce profil est déjà lié à un autre compte" }, { status: 409 });
  }

  // Link
  await prisma.user.update({
    where: { id: user.id },
    data: { playerId: params.id },
  });

  return Response.json({ ok: true, userName: user.name || user.email });
}

// DELETE /api/players/:id/link-account — unlink
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin) return new Response("Forbidden", { status: 403 });

  await prisma.user.updateMany({
    where: { playerId: params.id },
    data: { playerId: null },
  });

  return Response.json({ ok: true });
}
