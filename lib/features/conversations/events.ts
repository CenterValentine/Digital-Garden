/**
 * Conversation event bus — Session 4b.
 *
 * In-process pub/sub for conversation mutations, keyed by owner userId.
 * Mirrors the collaboration presence-server pattern: a `globalThis`-
 * pinned store (survives HMR + module re-eval) holding a
 * `Map<userId, Set<listener>>`.
 *
 * Serverless caveat (Vercel): this bus only notifies listeners on the
 * SAME instance that published. A mutation handled by instance A won't
 * reach an SSE listener parked on instance B. That's acceptable here
 * because the SSE route ALSO polls on an interval as a cross-instance
 * fallback, and the originating surface updates its own cache store
 * optimistically. The bus exists purely to make same-instance updates
 * feel instant (the common case: one browser, one warm instance).
 */

import "server-only";
import type { ConversationEvent } from "./event-types";

type Listener = (event: ConversationEvent) => void;

interface ConversationEventStore {
  /** userId → set of live SSE listeners. */
  listeners: Map<string, Set<Listener>>;
}

declare global {
  var __dgConversationEventStore: ConversationEventStore | undefined;
}

function getStore(): ConversationEventStore {
  if (!globalThis.__dgConversationEventStore) {
    globalThis.__dgConversationEventStore = {
      listeners: new Map(),
    };
  }
  return globalThis.__dgConversationEventStore;
}

/**
 * Publish an event to all same-instance listeners for the given user.
 * Fire-and-forget; never throws (a bad listener can't break the caller's
 * mutation path).
 */
export function publishConversationEvent(
  userId: string,
  event: ConversationEvent,
): void {
  const listeners = getStore().listeners.get(userId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* a misbehaving listener must not break the publish loop */
    }
  }
}

/**
 * Subscribe to a user's conversation events. Returns an unsubscribe fn.
 * The SSE route calls this on connect and the returned fn on abort.
 */
export function subscribeConversationEvents(
  userId: string,
  listener: Listener,
): () => void {
  const store = getStore();
  const listeners = store.listeners.get(userId) ?? new Set<Listener>();
  listeners.add(listener);
  store.listeners.set(userId, listeners);
  return () => {
    const set = store.listeners.get(userId);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) store.listeners.delete(userId);
  };
}
