/**
 * Relative timestamps ("3 hours ago", "last week") via Intl.RelativeTimeFormat.
 *
 * Extracted from RecentsPanel, which had the only copy. Kept dependency-free:
 * the platform formatter already handles pluralisation and locale, so a date
 * library would be weight for nothing at this size.
 *
 * `now` is a parameter, not a `Date.now()` call inside the function, so
 * callers that render this during a React render pass can hold the clock in
 * state and stay pure (the React Compiler rejects impure calls in render).
 * It defaults to the current time for callers outside that constraint.
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const deltaSeconds = Math.round((timestamp - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, seconds] of table) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return rtf.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return "just now";
}
