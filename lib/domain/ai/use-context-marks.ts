/**
 * useContextMarks — the user's hand on the model-facing transcript
 * (CONTEXT-WINDOW-EDITOR-PLAN §4/§7).
 *
 * Marks are written optimistically into the UIMessage's metadata (so the
 * next send carries them and the chips update at once) and persisted
 * through the binding's `marksRef` when the chat is bound to a
 * Conversation. Unbound (transient) chats keep the marks in message state
 * only; the binding persists the metadata with the message when it is
 * first saved.
 */

"use client";

import { useCallback, useMemo, type RefObject } from "react";
import type { UIMessage } from "ai";
import { userMarkStates } from "./context-diet";
import {
  isMarkablePart,
  mergeContextMarks,
  partMarkKey,
  readContextMarks,
  withContextMarks,
} from "./context-marks";
import type { ContextMarkActions } from "@/state/model-context-store";

export interface ContextMarksPatch {
  add?: string[];
  remove?: string[];
  lineAbove?: boolean;
}

export type PersistMarks = (messageId: string, patch: ContextMarksPatch) => Promise<void>;

type SetMessages = (updater: (prev: UIMessage[]) => UIMessage[]) => void;

/** Keys of the parts an exchange-level mark touches: text and tool results. */
export function exchangePartKeys(message: UIMessage): string[] {
  const keys: string[] = [];
  message.parts.forEach((part, idx) => {
    if (!isMarkablePart(part)) return;
    const type = (part as { type?: string }).type ?? "";
    if (type === "reasoning" || type === "file") return;
    if ((type.startsWith("tool-") || type === "dynamic-tool") && (part as { state?: string }).state !== "output-available") return;
    keys.push(partMarkKey(part, idx));
  });
  return keys;
}

export function useContextMarks({
  messages,
  setMessages,
  marksRef,
}: {
  messages: UIMessage[];
  setMessages: SetMessages;
  /** Populated by useConversationBinding in bound mode; null/undefined otherwise. */
  marksRef?: RefObject<PersistMarks | null>;
}): { markStates: ReturnType<typeof userMarkStates>; actions: ContextMarkActions } {
  const markStates = useMemo(() => userMarkStates(messages), [messages]);

  const apply = useCallback(
    (messageId: string, patch: ContextMarksPatch) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? withContextMarks(m, mergeContextMarks(readContextMarks(m), patch)) : m,
        ),
      );
      void marksRef?.current?.(messageId, patch);
    },
    [setMessages, marksRef],
  );

  const togglePart = useCallback<ContextMarkActions["togglePart"]>(
    (messageId, key, removed) => apply(messageId, removed ? { add: [key] } : { remove: [key] }),
    [apply],
  );

  const dropExchange = useCallback<ContextMarkActions["dropExchange"]>(
    (assistantMessageId, removed) => {
      const idx = messages.findIndex((m) => m.id === assistantMessageId);
      if (idx === -1) return;
      const targets = [messages[idx]];
      if (idx > 0 && messages[idx - 1].role === "user") targets.unshift(messages[idx - 1]);
      for (const m of targets) {
        const keys = exchangePartKeys(m);
        if (keys.length === 0) continue;
        apply(m.id, removed ? { add: keys } : { remove: keys });
      }
    },
    [messages, apply],
  );

  const setLine = useCallback<ContextMarkActions["setLine"]>(
    (userMessageId) => {
      for (const m of messages) {
        if (m.role !== "user") continue;
        const has = readContextMarks(m).lineAbove === true;
        const want = userMessageId != null && m.id === userMessageId;
        if (has !== want) apply(m.id, { lineAbove: want });
      }
    },
    [messages, apply],
  );

  const actions = useMemo<ContextMarkActions>(
    () => ({ togglePart, dropExchange, setLine }),
    [togglePart, dropExchange, setLine],
  );

  return { markStates, actions };
}
