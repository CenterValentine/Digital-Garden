"use client";

/**
 * Legacy /inbox route — the inbox is now a workspace view, not a page.
 * Bridge old links/deep-links (?tab=&thread=) into the left-panel view
 * store, then replace to /content where the Inbox view renders.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useInboxViewStore, type InboxTab } from "@/state/inbox-view-store";

export default function LegacyInboxRedirect() {
  const router = useRouter();
  const openInbox = useInboxViewStore((state) => state.openInbox);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    const tab: InboxTab =
      raw === "messages" || raw === "connections" ? raw : "notifications";
    openInbox(tab, params.get("thread"));
    router.replace("/content");
  }, [openInbox, router]);

  return null;
}
