// Side-effect-only module: load .env.local then .env into process.env.
//
// Import this BEFORE any module that reads process.env at load time
// (e.g. lib/database/client.ts reads DATABASE_URL synchronously).
// ESM evaluates imports depth-first in declaration order, so listing
// this import first in a script guarantees env is populated before
// downstream modules read from it.
//
// Mirrors the dotenv pattern in prisma.config.ts so CLI and scripts
// resolve env the same way.

import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv(); // fallback to .env
