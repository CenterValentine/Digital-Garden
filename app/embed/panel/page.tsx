/**
 * Embed Panel Page — the mini-DG shell served inside the extension's side
 * panel (BROWSER-REACH B1). File tree + tabbed content workspace + chat at
 * panel width. The extension contributes only a thin context bar above this
 * iframe; everything rendered here is the real app.
 *
 * Auth mirrors /embed/content/[id]: cookie path first, then the ?_t= URL
 * token fallback for cross-site iframe contexts.
 */

import { redirect } from "next/navigation";
import { getSession, validateSession } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { PanelShellClient } from "./PanelShellClient";

type ThemePreference = "light" | "dark" | "system";

/**
 * The app normally applies `.dark` via a pre-hydration script reading
 * localStorage["notes:settings"]. Inside the extension iframe that storage is
 * partitioned and empty, so no class is applied and every `dark:` variant
 * silently renders light — a light chat surface inside a dark panel. The
 * preference is also persisted server-side, so resolve it here where we
 * already have the session and hand it to the client.
 */
async function readThemePreference(userId: string): Promise<ThemePreference> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const ui = (user?.settings as { ui?: { theme?: string } } | null)?.ui;
    if (ui?.theme === "light" || ui?.theme === "dark" || ui?.theme === "system") {
      return ui.theme;
    }
  } catch {
    // Settings are advisory here — fall through to the client's own resolution.
  }
  return "system";
}

type SearchParams = Promise<{ _t?: string }>;

export default async function EmbedPanelPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  let session = await getSession();

  if (!session) {
    const { _t } = await searchParams;
    if (_t) {
      session = await validateSession(_t);
    }
  }

  if (!session) redirect("/sign-in");

  const themePreference = await readThemePreference(session.user.id);

  return <PanelShellClient themePreference={themePreference} />;
}
