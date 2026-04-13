"use client";

export const AUTH_SESSION_CHANNEL_NAME = "dg-auth-session";

export type AuthSessionEvent =
  | {
      type: "signed-out";
      reason: "manual" | "session-expired" | "session-missing";
      timestamp: number;
    };

function isAuthSessionEvent(value: unknown): value is AuthSessionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AuthSessionEvent>;
  return event.type === "signed-out" && typeof event.timestamp === "number";
}

export function publishAuthSessionEvent(event: AuthSessionEvent) {
  try {
    const channel = new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  } catch {
    // Browser may not support BroadcastChannel or it may be disabled.
  }

  try {
    window.localStorage.setItem(AUTH_SESSION_CHANNEL_NAME, JSON.stringify(event));
    window.localStorage.removeItem(AUTH_SESSION_CHANNEL_NAME);
  } catch {
    // Storage fallback is advisory.
  }
}

export function publishSignedOut(reason: AuthSessionEvent["reason"] = "manual") {
  publishAuthSessionEvent({
    type: "signed-out",
    reason,
    timestamp: Date.now(),
  });
}

export function subscribeAuthSessionEvents(listener: (event: AuthSessionEvent) => void) {
  let channel: BroadcastChannel | null = null;

  try {
    channel = new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      if (isAuthSessionEvent(event.data)) listener(event.data);
    });
  } catch {
    channel = null;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_SESSION_CHANNEL_NAME || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      if (isAuthSessionEvent(parsed)) listener(parsed);
    } catch {
      // Ignore malformed storage events.
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", handleStorage);
  };
}
