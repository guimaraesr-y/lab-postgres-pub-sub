export const config = {
  port: Number(Bun.env.PORT ?? 3000),
  instanceName: Bun.env.INSTANCE_NAME ?? "api-local",
  databaseUrl:
    Bun.env.DATABASE_URL ??
    "postgres://northstar:northstar@localhost:5432/northstar",
  notificationChannel: "ticket_changed",
} as const;
