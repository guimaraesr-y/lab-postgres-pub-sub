import { config } from "./config";
import {
  findTicket,
  listTickets,
  sql,
  updateTicketStatus,
  type TicketStatus,
} from "./db";
import { startPostgresListener } from "./listener";
import { createSseResponse, heartbeat, localClientCount } from "./sse";

const VALID_STATUSES = new Set<TicketStatus>([
  "waiting",
  "in_progress",
  "resolved",
]);

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function parseTicketId(pathname: string): number | null {
  const match = pathname.match(/^\/tickets\/(\d+)$/);
  if (!match) return null;

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

await sql.connect();
const subscription = await startPostgresListener();

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",

  async fetch(request, server) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(Bun.file("./public/index.html"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        instance: config.instanceName,
        sseClients: localClientCount(),
      });
    }

    if (request.method === "GET" && url.pathname === "/events") {
      // SSE connections are intentionally long-lived.
      server.timeout(request, 0);
      return createSseResponse(request);
    }

    if (request.method === "GET" && url.pathname === "/tickets") {
      return json({ tickets: await listTickets(), instance: config.instanceName });
    }

    const ticketId = parseTicketId(url.pathname);

    if (request.method === "GET" && ticketId !== null) {
      const ticket = await findTicket(ticketId);
      return ticket
        ? json({ ticket, instance: config.instanceName })
        : json({ error: "ticket_not_found" }, 404);
    }

    if (request.method === "PATCH" && ticketId !== null) {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      const status =
        typeof body === "object" &&
        body !== null &&
        "status" in body &&
        typeof body.status === "string"
          ? body.status
          : null;

      if (!status || !VALID_STATUSES.has(status as TicketStatus)) {
        return json(
          {
            error: "invalid_status",
            allowed: [...VALID_STATUSES],
          },
          400,
        );
      }

      const ticket = await updateTicketStatus(
        ticketId,
        status as TicketStatus,
      );

      if (!ticket) return json({ error: "ticket_not_found" }, 404);

      console.log(
        `[${config.instanceName}] updated ticket ${ticket.id} -> ${ticket.status}; NOTIFY queued in transaction`,
      );

      return json({ ticket, handledBy: config.instanceName });
    }

    return json(
      {
        error: "not_found",
        routes: [
          "GET /",
          "GET /health",
          "GET /events",
          "GET /tickets",
          "GET /tickets/:id",
          "PATCH /tickets/:id",
        ],
      },
      404,
    );
  },

  error(error) {
    console.error(`[${config.instanceName}] request failed`, error);
    return json({ error: "internal_server_error" }, 500);
  },
});

console.log(
  `[${config.instanceName}] HTTP server listening on ${server.url.toString()}`,
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[${config.instanceName}] ${signal}: shutting down`);
  clearInterval(heartbeat);

  await subscription.unlisten();
  await server.stop(true);
  await sql.close({ timeout: 2 });

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
