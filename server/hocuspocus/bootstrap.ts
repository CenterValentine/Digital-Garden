import { config } from "dotenv";

config({ path: ".env.local" });
config();

import("./server").catch((error) => {
  console.error("[hocuspocus] failed to start", error);
  process.exit(1);
});
