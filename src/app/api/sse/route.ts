import { sseEmitter } from "@/lib/sse";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {
          close();
        }
      };

      const matchHandler = (payload: { tournamentId: string }) => {
        if (tournamentId && payload.tournamentId !== tournamentId) return;
        sendEvent("match", payload);
      };

      const tournamentHandler = (payload: { tournamentId: string }) => {
        if (tournamentId && payload.tournamentId !== tournamentId) return;
        sendEvent("tournament", payload);
      };

      const channelHandler = (payload: unknown) => {
        sendEvent("channel", payload);
      };

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          close();
        }
      }, 15000);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        sseEmitter.off("match", matchHandler);
        sseEmitter.off("tournament", tournamentHandler);
        sseEmitter.off("channel", channelHandler);
        try { controller.close(); } catch { /* already closed */ }
      };

      sseEmitter.on("match", matchHandler);
      sseEmitter.on("tournament", tournamentHandler);
      sseEmitter.on("channel", channelHandler);
      controller.enqueue(encoder.encode(`: connected\n\n`));

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
