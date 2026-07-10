/**
 * Inbox page — unified notifications / messages / connections.
 */

import { Suspense } from "react";
import { InboxShell } from "@/components/client/inbox/InboxShell";

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxShell />
    </Suspense>
  );
}
