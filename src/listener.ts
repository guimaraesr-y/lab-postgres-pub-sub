import { config } from "./config";
import { findTicket, sql } from "./db";
import { broadcast } from "./sse";

export async function startPostgresListener() {
  return sql.listen(
    config.notificationChannel,
    (payload) => {
      void handleTicketChanged(payload).catch((error) => {
        console.error(
          `[${config.instanceName}] failed to handle ${config.notificationChannel}`,
          error,
        );
      });
    },
    () => {
      console.log(
        `[${config.instanceName}] LISTEN ${config.notificationChannel} ready`,
      );
    },
  );
}

async function handleTicketChanged(payload: string): Promise<void> {
  const id = Number(payload);

  if (!Number.isInteger(id) || id <= 0) {
    console.warn(
      `[${config.instanceName}] ignored invalid NOTIFY payload: ${payload}`,
    );
    return;
  }

  console.log(
    `[${config.instanceName}] received NOTIFY ${config.notificationChannel}:${id}`,
  );

  // NOTIFY is the signal. The database remains the source of truth.
  const ticket = await findTicket(id);
  if (!ticket) {
    console.warn(
      `[${config.instanceName}] ticket ${id} no longer exists; nothing to broadcast`,
    );
    return;
  }

  const delivered = broadcast("ticket.changed", {
    ticket,
    deliveredBy: config.instanceName,
  });

  console.log(
    `[${config.instanceName}] pushed ticket ${id} to ${delivered} local SSE client(s)`,
  );
}
