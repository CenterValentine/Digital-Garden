/**
 * Client-side notification kind renderer contract.
 *
 * Kept in its own module (no JSX, no registry imports) so both the core
 * kind registry and the extension system (`ExtensionRuntime.
 * notificationKindRenderers`) can reference it without circular imports.
 */

import type { ComponentType } from "react";
import type { NotificationDTO } from "@/lib/domain/notifications/types";

/** In-app target for inbox-hosted notification kinds (no page navigation). */
export interface NotificationInboxTarget {
  tab: "notifications" | "messages" | "connections";
  threadId?: string;
}

export interface NotificationKindRenderer {
  icon: ComponentType<{ className?: string }>;
  Body: ComponentType<{ notification: NotificationDTO }>;
  /** Inline actions (e.g. Accept/Decline on a connection invite). */
  Actions?: ComponentType<{ notification: NotificationDTO }>;
  /**
   * In-app inbox target for kinds hosted by the workspace Inbox surface
   * (connections, messages). Preferred over getHref — the row opens the
   * inbox view + tab/thread instead of navigating to a page.
   */
  getInboxTarget?: (
    notification: NotificationDTO,
  ) => NotificationInboxTarget | null;
  /** Route click-through for non-inbox kinds (content/external). */
  getHref?: (notification: NotificationDTO) => string | null;
}
