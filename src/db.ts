import { sql } from "bun";
import { config } from "./config";

export { sql };

export type TicketStatus = "waiting" | "in_progress" | "resolved";

export type Ticket = {
  id: number;
  title: string;
  status: TicketStatus;
  created_at: Date;
  updated_at: Date;
};

export async function listTickets(): Promise<Ticket[]> {
  return sql<Ticket[]>`
    SELECT id, title, status, created_at, updated_at
    FROM tickets
    ORDER BY id
  `;
}

export async function findTicket(id: number): Promise<Ticket | null> {
  const rows = await sql<Ticket[]>`
    SELECT id, title, status, created_at, updated_at
    FROM tickets
    WHERE id = ${id}
  `;

  return rows[0] ?? null;
}

export async function updateTicketStatus(
  id: number,
  status: TicketStatus,
): Promise<Ticket | null> {
  return sql.begin(async (tx) => {
    const rows = await tx<Ticket[]>`
      UPDATE tickets
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, status, created_at, updated_at
    `;

    const ticket = rows[0];
    if (!ticket) return null;

    // tx.notify participates in this transaction: PostgreSQL only delivers
    // the notification after COMMIT and discards it if the transaction rolls back.
    await tx.notify(config.notificationChannel, String(ticket.id));

    return ticket;
  });
}
