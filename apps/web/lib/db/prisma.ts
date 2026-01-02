// Prisma Client singleton
// This ensures we only create one instance of Prisma Client

import { PrismaClient, Prisma } from "@/lib/generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL || "";
const isAccelerateUrl =
  databaseUrl.startsWith("prisma://") ||
  databaseUrl.startsWith("prisma+postgres://");

const logLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"];

// Prisma client configuration
// If using Accelerate, use accelerateUrl; otherwise use adapter for direct PostgreSQL connection
const prismaClient = isAccelerateUrl
  ? new PrismaClient({
      log: logLevels,
      accelerateUrl: databaseUrl,
    })
  : // For direct PostgreSQL connections, use the pg adapter
    (() => {
      const pool = new Pool({ connectionString: databaseUrl });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        log: logLevels,
        adapter,
      });
    })();

// No new client is created if one already exists
export const prisma = globalForPrisma.prisma ?? prismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
