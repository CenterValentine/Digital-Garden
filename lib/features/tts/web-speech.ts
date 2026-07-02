/**
 * Web Speech API helpers — the keyless, offline fallback engine.
 *
 * `window.speechSynthesis` uses the OS/browser voices: free, instant, no
 * network, lower quality. Used when the device is offline or the cloud route
 * fails. All access is guarded so this module is import-safe under SSR.
 */

export function isWebSpeechAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

/**
 * Voices load asynchronously in some browsers (the first call can be empty
 * until `voiceschanged` fires). Returns whatever is available now.
 */
export function getWebSpeechVoices(): SpeechSynthesisVoice[] {
  if (!isWebSpeechAvailable()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Subscribe to voice-list availability. Fires once voices are populated and on
 * subsequent changes. Returns an unsubscribe fn. No-op when unsupported.
 */
export function onWebSpeechVoicesChanged(cb: () => void): () => void {
  if (!isWebSpeechAvailable()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () =>
    window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

export interface WebSpeechHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Speak text with the Web Speech engine. Cancels any in-flight utterance first
 * (the engine is global/single-channel). Returns the utterance so the caller
 * can keep a reference, or null when unsupported.
 */
export function speakWithWebSpeech(
  text: string,
  opts: { rate?: number; voiceUri?: string },
  handlers: WebSpeechHandlers = {},
): SpeechSynthesisUtterance | null {
  if (!isWebSpeechAvailable()) return null;
  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new window.SpeechSynthesisUtterance(text);
  if (opts.rate) utterance.rate = opts.rate;
  if (opts.voiceUri) {
    const voice = synth.getVoices().find((v) => v.voiceURI === opts.voiceUri);
    if (voice) utterance.voice = voice;
  }
  if (handlers.onStart) utterance.onstart = () => handlers.onStart?.();
  if (handlers.onEnd) utterance.onend = () => handlers.onEnd?.();
  if (handlers.onError) {
    utterance.onerror = (e) =>
      handlers.onError?.(e.error ?? "Web Speech playback failed");
  }

  synth.speak(utterance);
  return utterance;
}
