import { config } from "dotenv";

config({ path: ".env.local" });
config();

const required = ["DATABASE_URL", "COLLABORATION_TOKEN_SECRET"];
// COLLABORATION_WRITE_SECRET gates /internal/apply — the path AI/extension writes
// take to reach a live document. Missing it is not fatal (writes fall back to
// writing NotePayload directly, which is masked by any open editor) but it IS a
// silent capability loss, so it must be surfaced here rather than discovered later.
// It is the ONLY variable this feature adds: the endpoint's address comes from
// NEXT_PUBLIC_HOCUSPOCUS_URL, because there is one collaboration server.
const recommended = ["NEXT_PUBLIC_HOCUSPOCUS_URL", "COLLABORATION_WRITE_SECRET"];

const missingRequired = required.filter((key) => !process.env[key]);
const missingRecommended = recommended.filter((key) => !process.env[key]);

if (missingRequired.length > 0) {
  console.error(
    `[hocuspocus-env] Missing required environment variables: ${missingRequired.join(", ")}`
  );
  process.exit(1);
}

if (missingRecommended.length > 0) {
  console.warn(
    `[hocuspocus-env] Missing recommended environment variables: ${missingRecommended.join(", ")}`
  );
}

console.log("[hocuspocus-env] Environment configuration looks usable.");
