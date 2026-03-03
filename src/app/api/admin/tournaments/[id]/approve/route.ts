import { auth } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.role || !hasAtLeastRole(session.user.role, "ADMIN")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return new Response("Not found", { status: 404 });

  await prisma.tournament.update({
    where: { id: params.id },
    data: { approved: true, locked: false, submissionStatus: "APPROVED", rejectionReason: null }
  });

  // Redirect back to admin page
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin" }
  });
}
