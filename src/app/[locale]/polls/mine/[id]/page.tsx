import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { canManagePoll } from "@/lib/poll-access";
import { PollResultsDetail } from "@/components/PollResultsDetail";

export default async function MyPollResultsPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.playerId) redirect("/login");

  const poll = await prisma.poll.findUnique({ where: { id: params.id }, select: { createdById: true } });
  if (!poll || !canManagePoll(poll, session)) notFound();

  return (
    <div className="page" style={{ maxWidth: 760, margin: "0 auto" }}>
      <PollResultsDetail pollId={params.id} backHref="/polls/mine" />
    </div>
  );
}
