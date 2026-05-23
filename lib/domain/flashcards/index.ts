export * from "./api";
export * from "./content";
export * from "./types";
export * from "./fsrs";
// CRITICAL: re-export ONLY the client-safe derive helpers from
// legacy-derive.ts here. legacy-compat.ts has a Prisma value import
// and MUST be deep-imported by server callers
// (@/lib/domain/flashcards/legacy-compat). Re-exporting it through
// this barrel would drag the pg driver into the client bundle and
// break the build with "Module not found: dns/net/tls/fs".
export * from "./legacy-derive";
