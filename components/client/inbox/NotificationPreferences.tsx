"use client";

/**
 * Notification preferences — per-kind toggles + AI master switch.
 *
 * Extracted verbatim from the old /settings/notifications page (same shared
 * settings primitives, same useSettingsStore wiring) so it can be hosted
 * inside the Inbox surface instead of a standalone settings route. Enforced
 * server-side at publish time — turning a kind off stops NEW notifications.
 */

import { Switch } from "@/components/client/ui/switch";
import {
  SavedIndicator,
  SettingRow,
  SettingSection,
  useSaveTracker,
} from "@/components/settings/ui";
import { useSettingsStore } from "@/state/settings-store";

const KIND_OPTIONS: Array<{
  kind: string;
  label: string;
  description: string;
}> = [
  {
    kind: "connection.invite",
    label: "Connection invites",
    description: "When someone invites you to connect.",
  },
  {
    kind: "connection.accepted",
    label: "Accepted invites",
    description: "When someone accepts your connection invite.",
  },
  {
    kind: "dm.message",
    label: "Direct messages",
    description:
      "When you receive a message while not viewing the conversation.",
  },
  {
    kind: "system.announcement",
    label: "System announcements",
    description: "Product updates and important notices.",
  },
];

export function NotificationPreferences() {
  const notifications = useSettingsStore((state) => state.notifications);
  const setNotificationsSettings = useSettingsStore(
    (state) => state.setNotificationsSettings,
  );

  const activity = useSaveTracker();
  const ai = useSaveTracker();

  const kinds = notifications?.kinds ?? {};
  const aiEnabled = notifications?.aiNotificationsEnabled !== false;

  return (
    <div className="space-y-8">
      <SettingSection
        title="Activity"
        description="Choose which kinds reach your inbox. Disabled kinds are stopped at the source — nothing new is created for them."
        action={<SavedIndicator status={activity.status} error={activity.error} />}
      >
        {KIND_OPTIONS.map((option) => {
          const id = `notif-pref-${option.kind}`;
          return (
            <SettingRow
              key={option.kind}
              label={option.label}
              description={option.description}
              htmlFor={id}
            >
              <Switch
                id={id}
                checked={kinds[option.kind] !== false}
                onCheckedChange={(next) =>
                  void activity.track(
                    setNotificationsSettings({ kinds: { [option.kind]: next } }),
                  )
                }
              />
            </SettingRow>
          );
        })}
      </SettingSection>

      <SettingSection
        title="AI notifications"
        description="Assistant-generated notifications are always badged as AI."
        action={<SavedIndicator status={ai.status} error={ai.error} />}
      >
        <SettingRow
          label="Allow AI to notify you"
          description="Lets the assistant post reminders and task results to your inbox (rate limited, always badged as AI)."
          htmlFor="notif-pref-ai"
        >
          <Switch
            id="notif-pref-ai"
            checked={aiEnabled}
            onCheckedChange={(next) =>
              void ai.track(
                setNotificationsSettings({ aiNotificationsEnabled: next }),
              )
            }
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
