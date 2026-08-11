/**
 * Embed Tree Page — the file tree served inside the extension's right-side
 * ON-PAGE OVERLAY (PANEL-OVERLAY-PLAN Phase 1). A separate partitioned iframe
 * from /embed/panel: it renders ONLY the tree, so the sidebar is reclaimed for
 * chat + content.
 *
 * Auth mirrors /embed/panel: cookie path first, then the ?_t= URL token
 * fallback for cross-site iframe contexts.
 */

import { redirect } from "next/navigation";
import { getSession, validateSession } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { TreeShellClient } from "./TreeShellClient";

type ThemePreference = "light" | "dark" | "system";

/**
 * The partitioned iframe's localStorage is empty, so the pre-hydration `.dark`
 * script never fires. The preference is persisted server-side, so resolve it
 * here (where the session exists) and hand it to the client — same as
 * /embed/panel.
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
    // Advisory — fall through to the client's own resolution.
  }
  return "system";
}

type SearchParams = Promise<{ _t?: string }>;

export default async function EmbedTreePage({
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

  return <TreeShellClient themePreference={themePreference} />;
}
