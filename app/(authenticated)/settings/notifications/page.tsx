/**
 * Notification Preferences Settings Page
 *
 * Per-kind enable toggles + the AI notifications master switch. These are
 * enforced server-side at publish time (publishEvent skips disabled kinds),
 * so turning a kind off stops NEW notifications — existing ones remain in
 * the inbox until read/archived. Connection/message management itself lives
 * in /inbox, not here.
 */

"use client";

import { Switch } from "@/components/client/ui/switch";
import {
  SavedIndicator,
  SettingRow,
  SettingSection,
  SettingsPage,
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

export default function NotificationsSettingsPage() {
  const notifications = useSettingsStore((state) => state.notifications);
  const setNotificationsSettings = useSettingsStore(
    (state) => state.setNotificationsSettings,
  );

  const activity = useSaveTracker();
  const ai = useSaveTracker();

  const kinds = notifications?.kinds ?? {};
  const aiEnabled = notifications?.aiNotificationsEnabled !== false;

  return (
    <SettingsPage
      title="Notifications"
      description="Choose which notifications reach your inbox. Disabled kinds are stopped at the source — nothing new is created for them."
    >
      <SettingSection
        title="Activity"
        action={<SavedIndicator status={activity.status} error={activity.error} />}
      >
        {KIND_OPTIONS.map((option) => {
          const id = `notif-${option.kind}`;
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
          htmlFor="notif-ai"
        >
          <Switch
            id="notif-ai"
            checked={aiEnabled}
            onCheckedChange={(next) =>
              void ai.track(
                setNotificationsSettings({ aiNotificationsEnabled: next }),
              )
            }
          />
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
