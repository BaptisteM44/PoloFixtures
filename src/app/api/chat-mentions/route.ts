import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChatAudience, type ChatKind } from "@/lib/chat-mentions";

const KINDS: ChatKind[] = ["team", "tournament", "squad", "club", "session"];

// GET /api/chat-mentions?kind=team&id=… → personnes @mentionnables dans ce chat
export async function GET(req: Request) {
  const session = await auth();
  const playerId = session?.user?.playerId;
  if (!playerId) return NextResponse.json({ people: [] }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as ChatKind;
  const id = url.searchParams.get("id") ?? "";
  if (!KINDS.includes(kind) || !id) return NextResponse.json({ people: [] }, { status: 400 });
  const audience = await getChatAudience(kind, id, playerId);
  if (!audience) return NextResponse.json({ people: [] }, { status: 403 });
  return NextResponse.json({ people: audience.people.filter((p) => p.id !== playerId) });
}
