import { config } from "./config";

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function encodeEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createSseResponse(request: Request): Response {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      clients.add(controller);

      controller.enqueue(
        encodeEvent("connected", {
          instance: config.instanceName,
          connectedAt: new Date().toISOString(),
        }),
      );

      console.log(
        `[${config.instanceName}] SSE client connected (${clients.size} local)`,
      );
    },
    cancel() {
      if (controllerRef) clients.delete(controllerRef);
      console.log(
        `[${config.instanceName}] SSE client disconnected (${clients.size} local)`,
      );
    },
  });

  // If the peer goes away Bun eventually cancels the response stream. The abort
  // listener makes local cleanup deterministic when Request.signal fires first.
  request.signal.addEventListener(
    "abort",
    () => {
      if (controllerRef) clients.delete(controllerRef);
    },
    { once: true },
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function broadcast(event: string, data: unknown): number {
  const message = encodeEvent(event, data);
  let delivered = 0;

  for (const controller of [...clients]) {
    try {
      controller.enqueue(message);
      delivered += 1;
    } catch {
      clients.delete(controller);
    }
  }

  return delivered;
}

export function localClientCount(): number {
  return clients.size;
}

export const heartbeat = setInterval(() => {
  broadcast("heartbeat", {
    instance: config.instanceName,
    at: new Date().toISOString(),
  });
}, 15_000);
