// Prisma Client singleton + structured-log bridge.
//
// We use `emit: "event"` for all log levels so Prisma's output goes through
// our logger instead of stdout. Each query becomes a `content:db:query`
// debug-level event that inherits the active trace context via ALS.

import { PrismaClient, Prisma } from "@/lib/database/generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "@/lib/core/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

const databaseUrl = process.env.DATABASE_URL || "";
const isAccelerateUrl =
  databaseUrl.startsWith("prisma://") ||
  databaseUrl.startsWith("prisma+postgres://");

// Event-emit configuration — Prisma fires events instead of writing to stdout.
// In dev we register listeners for all levels; in prod we still listen so
// Prisma errors/warnings flow through the structured logger.
type EventLogOption = { emit: "event"; level: Prisma.LogLevel };

const logOptions: EventLogOption[] =
  process.env.NODE_ENV === "development"
    ? [
        { emit: "event", level: "query" },
        { emit: "event", level: "info" },
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ]
    : [
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ];

// ----------------------------------------------------------------------
// SQL template parser
// ----------------------------------------------------------------------
// Goal: produce a short, scannable summary like "SELECT ContentNode" or
// "INSERT INTO Account" from a raw Prisma-emitted SQL string. The full
// SQL is intentionally NOT logged in attrs — short summary in pretty,
// full template in attrs.sql only when small enough to survive the
// redaction string-truncation cap.

interface QuerySummary {
  op: string;
  table: string;
  param_count: number;
}

function parseQuerySummary(sql: string): QuerySummary {
  const trimmed = sql.trim();
  const paramMatches = trimmed.match(/\$\d+/g);
  const param_count = paramMatches ? paramMatches.length : 0;

  // INSERT INTO "schema"."Table"
  const insertMatch = trimmed.match(/^INSERT\s+INTO\s+"[^"]+"\."([^"]+)"/i);
  if (insertMatch) return { op: "INSERT", table: insertMatch[1], param_count };

  // UPDATE "schema"."Table"
  const updateMatch = trimmed.match(/^UPDATE\s+"[^"]+"\."([^"]+)"/i);
  if (updateMatch) return { op: "UPDATE", table: updateMatch[1], param_count };

  // DELETE FROM "schema"."Table"
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+"[^"]+"\."([^"]+)"/i);
  if (deleteMatch) return { op: "DELETE", table: deleteMatch[1], param_count };

  // SELECT ... FROM "schema"."Table"
  if (/^SELECT\b/i.test(trimmed)) {
    const fromMatch = trimmed.match(/FROM\s+"[^"]+"\."([^"]+)"/i);
    return {
      op: "SELECT",
      table: fromMatch?.[1] ?? "?",
      param_count,
    };
  }

  // Fallback: first word as op
  const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() ?? "?";
  return { op: firstWord, table: "?", param_count };
}

function buildQuerySummary({ op, table, param_count }: QuerySummary): string {
  // Surface big IN-clauses prominently — they're often a sign of n+1 pattern.
  if (param_count >= 20) {
    return `${op} ${table} (×${param_count} params)`;
  }
  return `${op} ${table}`;
}

// ----------------------------------------------------------------------
// Client factory + bridge wiring
// ----------------------------------------------------------------------

function attachLogBridge(client: PrismaClient): PrismaClient {
  // Prisma's `$on('query', cb)` only exists when log uses `emit: 'event'`.
  // We've configured it above, so the typed methods are available.

  client.$on("query" as never, (e: Prisma.QueryEvent) => {
    const summary = parseQuerySummary(e.query);
    logger.debug({
      layer: "content",
      event: "db:query",
      summary: buildQuerySummary(summary),
      duration_ms: Math.round(e.duration),
      attrs: {
        op: summary.op,
        table: summary.table,
        param_count: summary.param_count,
      },
    });
  });

  client.$on("info" as never, (e: Prisma.LogEvent) => {
    logger.info({
      layer: "content",
      event: "db:info",
      summary: e.message,
    });
  });

  client.$on("warn" as never, (e: Prisma.LogEvent) => {
    logger.warn({
      layer: "content",
      event: "db:warn",
      summary: e.message,
    });
  });

  client.$on("error" as never, (e: Prisma.LogEvent) => {
    logger.error({
      layer: "content",
      event: "db:error",
      summary: e.message,
    });
  });

  return client;
}

function createPrismaClient(): PrismaClient {
  if (isAccelerateUrl) {
    const client = new PrismaClient({
      log: logOptions,
      accelerateUrl: databaseUrl,
    });
    return attachLogBridge(client);
  }

  // Reuse one pg pool in development so HMR doesn't leak connections.
  const pool =
    globalForPrisma.prismaPool ?? new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaPool = pool;
  }

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    log: logOptions,
    adapter,
  });
  return attachLogBridge(client);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  // Sanity check: surface immediately if the Prisma client is missing a
  // model — happens when `prisma generate` is stale.
  if (typeof prisma.contentNode === "undefined") {
    logger.error({
      layer: "content",
      event: "prisma:client_invalid",
      summary: "contentNode model missing from Prisma client (run `prisma generate`)",
      attrs: { keys_sample: Object.keys(prisma).slice(0, 10).join(",") },
    });
  }
}
