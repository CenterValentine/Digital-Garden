/**
 * Input Trace Store (Development Only)
 *
 * Reactive mirror of the keystroke/transaction recorder singleton in
 * `lib/domain/editor/debug`. The recorder owns the buffer because it runs
 * outside React, driven by DOM and ProseMirror events; this store only
 * republishes its snapshots so debug views can render them.
 *
 * Data flow is one-way in each direction: actions here call into the recorder,
 * and the recorder pushes state back through the subscription below. The
 * recorder never imports this file, so there is no cycle.
 */

import { create } from "zustand";

import { inputTraceRecorder, type InputTraceEvent } from "@/lib/domain/editor/debug";

interface InputTraceStore {
  // State
  isRecording: boolean;
  events: InputTraceEvent[];
  droppedCount: number;
  attachedEditors: number;
  redactText: boolean;

  // Actions
  start: () => void;
  stop: () => void;
  toggleRecording: () => void;
  clear: () => void;
  setRedactText: (redact: boolean) => void;
  /** Pull current recorder state immediately, without waiting for a notify. */
  sync: () => void;
}

function readRecorderState() {
  return {
    isRecording: inputTraceRecorder.isRecording(),
    events: [...inputTraceRecorder.getEvents()],
    droppedCount: inputTraceRecorder.getDroppedCount(),
    attachedEditors: inputTraceRecorder.getAttachedCount(),
    redactText: inputTraceRecorder.getOptions().redactText,
  };
}

export const useInputTraceStore = create<InputTraceStore>((set) => ({
  // Initial state
  isRecording: false,
  events: [],
  droppedCount: 0,
  attachedEditors: 0,
  redactText: false,

  // Actions — thin pass-throughs; the recorder is the source of truth
  start: () => inputTraceRecorder.start(),
  stop: () => inputTraceRecorder.stop(),
  toggleRecording: () => {
    // Read the recorder, not this mirror — the mirror can lag a notify.
    if (inputTraceRecorder.isRecording()) {
      inputTraceRecorder.stop();
    } else {
      inputTraceRecorder.start();
    }
  },
  clear: () => inputTraceRecorder.clear(),
  setRedactText: (redact) => inputTraceRecorder.setOptions({ redactText: redact }),
  sync: () => set(readRecorderState()),
}));

// Recorder → store. The recorder throttles its own notifications, so this
// cannot thrash React during fast typing. `events` is replaced with a new
// array reference so selectors see the change.
inputTraceRecorder.subscribe(() => {
  useInputTraceStore.setState(readRecorderState());
});
