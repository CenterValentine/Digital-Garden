/**
 * Synthetic personal-home (m44 garden) fixture route.
 *
 * `/` only renders PersonalHome when the resolved tenant is slug "david" +
 * isPersonal, which a local Docker database never has (SITE_OWNER_ID names a
 * production user) — so the garden was unreachable in dev and its CSS/motion
 * regressions only surfaced on production. This mounts the SAME client shell
 * with `buildCats([])`, i.e. every path on its designed placeholder content
 * (lib/personal/staticGardenData.ts). No database access.
 *
 * Gated to non-production environments. To exercise on a Vercel preview,
 * set `PLAYWRIGHT_FIXTURES_ENABLED=1` in the preview's env.
 */

import { notFound } from "next/navigation";
import { PersonalHomeShell } from "@/components/home/PersonalHomeShell";
import { buildCats } from "@/lib/personal/buildCats";

const FIXTURES_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.PLAYWRIGHT_FIXTURES_ENABLED === "1";

export const dynamic = "force-dynamic";

export default function PersonalHomeFixturePage() {
  if (!FIXTURES_ENABLED) notFound();
  return <PersonalHomeShell cats={buildCats([])} />;
}
