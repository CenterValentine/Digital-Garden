import { config } from "dotenv";

config({ path: ".env.local" });
config();

const required = ["DATABASE_URL", "COLLABORATION_TOKEN_SECRET"];
const recommended = ["NEXT_PUBLIC_HOCUSPOCUS_URL"];

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
