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

import { getSurfaceStyles } from "@/lib/design/system";
import { useSettingsStore } from "@/state/settings-store";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-sky-500" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function NotificationsSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");
  const notifications = useSettingsStore((state) => state.notifications);
  const setNotificationsSettings = useSettingsStore(
    (state) => state.setNotificationsSettings,
  );

  const kinds = notifications?.kinds ?? {};
  const aiEnabled = notifications?.aiNotificationsEnabled !== false;

  const setKind = async (kind: string, enabled: boolean) => {
    try {
      await setNotificationsSettings({ kinds: { [kind]: enabled } });
    } catch {
      toast.error("Failed to save notification preference");
    }
  };

  const setAiEnabled = async (enabled: boolean) => {
    try {
      await setNotificationsSettings({ aiNotificationsEnabled: enabled });
    } catch {
      toast.error("Failed to save notification preference");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which notifications reach your inbox. Disabled kinds are
          stopped at the source — nothing new is created for them.
        </p>
      </div>

      <div
        className="rounded-xl border border-white/10 p-5"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </h2>
        <div className="mt-3 divide-y divide-white/5">
          {KIND_OPTIONS.map((option) => (
            <div
              key={option.kind}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
              <Toggle
                checked={kinds[option.kind] !== false}
                onChange={(next) => void setKind(option.kind, next)}
                label={option.label}
              />
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl border border-white/10 p-5"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          AI notifications
        </h2>
        <div className="mt-3 flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-medium">Allow AI to notify you</p>
            <p className="text-xs text-muted-foreground">
              Lets the assistant post reminders and task results to your inbox
              (rate limited, always badged as AI).
            </p>
          </div>
          <Toggle
            checked={aiEnabled}
            onChange={(next) => void setAiEnabled(next)}
            label="Allow AI to notify you"
          />
        </div>
      </div>
    </div>
  );
}
