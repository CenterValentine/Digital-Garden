// Prisma Client singleton
// This ensures we only create one instance of Prisma Client

let prismaClient: any;

try {
  // Try to import the generated Prisma client
  const { PrismaClient } = require("@/lib/generated/prisma/client");

  const globalForPrisma = globalThis as unknown as {
    prisma: typeof PrismaClient | undefined;
  };

  prismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });

  if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = prismaClient;
} catch (error) {
  // Prisma client not yet generated - create a proxy that throws helpful errors
  prismaClient = new Proxy({} as any, {
    get() {
      throw new Error(
        "Prisma client not initialized. Please run:\n" +
          "  1. pnpm install (to install @prisma/client)\n" +
          "  2. pnpm exec prisma generate\n" +
          "  3. pnpm exec prisma migrate dev"
      );
    },
  });
}

export const prisma = prismaClient;
