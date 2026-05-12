// Prisma Client singleton
// This ensures we only create one instance of Prisma Client

import { PrismaClient, Prisma } from "@/lib/database/generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

const databaseUrl = process.env.DATABASE_URL || "";
const isAccelerateUrl =
  databaseUrl.startsWith("prisma://") ||
  databaseUrl.startsWith("prisma+postgres://");

const logLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"];

function createPrismaClient() {
  if (isAccelerateUrl) {
    return new PrismaClient({
      log: logLevels,
      accelerateUrl: databaseUrl,
    });
  }

  // Reuse one pg pool in development so HMR doesn't leak connections.
  const pool =
    globalForPrisma.prismaPool ?? new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    log: logLevels,
    adapter,
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  // Debug: Log what's available on prisma client
  if (typeof prisma.contentNode === "undefined") {
    console.error(
      "[PRISMA DEBUG] contentNode is undefined! Available keys:",
      Object.keys(prisma).slice(0, 15),
    );
  }
}
