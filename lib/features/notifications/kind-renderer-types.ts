/**
 * Client-side notification kind renderer contract.
 *
 * Kept in its own module (no JSX, no registry imports) so both the core
 * kind registry and the extension system (`ExtensionRuntime.
 * notificationKindRenderers`) can reference it without circular imports.
 */

import type { ComponentType } from "react";
import type { NotificationDTO } from "@/lib/domain/notifications/types";

export interface NotificationKindRenderer {
  icon: ComponentType<{ className?: string }>;
  Body: ComponentType<{ notification: NotificationDTO }>;
  /** Inline actions (e.g. Accept/Decline on a connection invite). */
  Actions?: ComponentType<{ notification: NotificationDTO }>;
  /** Click-through target; return null for non-navigating notifications. */
  getHref?: (notification: NotificationDTO) => string | null;
}
