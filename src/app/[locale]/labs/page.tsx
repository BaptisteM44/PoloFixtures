import { auth } from "@/lib/auth";
import { LabsClient } from "@/components/labs/LabsClient";

export const dynamic = "force-dynamic";

export default async function LabsPage() {
  const session = await auth();
  const playerId = (session?.user as any)?.playerId ?? null;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const charterAccepted = (session?.user as any)?.charterAccepted ?? false;

  return (
    <LabsClient
      playerId={playerId}
      isAdmin={isAdmin}
      charterAccepted={charterAccepted}
    />
  );
}
