/**
 * Inbox renderers for studio notification kinds (registered via the studio
 * client runtime's notificationKindRenderers — the workflows extension
 * pattern). One kind: "studio.run", a generation run reaching done/failed.
 */

"use client";

import { CheckCircle2, LampDesk, XCircle } from "lucide-react";
import type { NotificationDTO } from "@/lib/domain/notifications/types";
import type { NotificationKindRenderer } from "@/lib/features/notifications/kind-renderer-types";

function payloadString(
  notification: NotificationDTO,
  key: string
): string | null {
  const value = (notification.payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function RunBody({ notification }: { notification: NotificationDTO }) {
  const status = payloadString(notification, "status");
  const toolLabel = payloadString(notification, "toolLabel") ?? "Studio tool";
  const folderName = payloadString(notification, "folderName");
  const outputTitle = payloadString(notification, "outputTitle");
  const error = payloadString(notification, "error");
  const done = status === "done";

  return (
    <div className="flex min-w-0 items-start gap-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-900 dark:text-gray-100">
          {done
            ? `${toolLabel} finished${outputTitle ? `: ${outputTitle}` : ""}`
            : `${toolLabel} failed`}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {done
            ? folderName
              ? `In "${folderName}" → Studio outputs`
              : "Open the folder's Studio tab to view it"
            : (error ?? "Open the folder's Studio tab for details")}
        </p>
      </div>
    </div>
  );
}

export const studioNotificationKindRenderers: Record<
  string,
  NotificationKindRenderer
> = {
  "studio.run": {
    icon: LampDesk,
    Body: RunBody,
  },
};
