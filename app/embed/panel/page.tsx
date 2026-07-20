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
import { PanelShellClient } from "./PanelShellClient";

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

  return <PanelShellClient />;
}
