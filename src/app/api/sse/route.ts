import { sseEmitter } from "@/lib/sse";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`event: match\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const handler = (payload: { tournamentId: string }) => {
        if (tournamentId && payload.tournamentId !== tournamentId) return;
        send(payload);
      };

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      sseEmitter.on("match", handler);
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const close = () => {
        clearInterval(keepAlive);
        sseEmitter.off("match", handler);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
