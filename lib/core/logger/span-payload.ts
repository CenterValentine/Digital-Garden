import type { SpanHandle } from "./span";
import { writePayload } from "./payload-sidecar";

/**
 * Capture a payload to the per-trace sidecar and attach a reference to the
 * span as `payload_ref` (last call wins for the visible ref). Multiple
 * spanPayload calls inside one span all write to the same sidecar file
 * with distinct labels.
 *
 * Production: writePayload is a no-op (no fs writes); this just returns
 * the value unchanged.
 *
 * Usage:
 *   const note = await spanPayload(span, "note_response",
 *     await prisma.contentNode.findUnique(...));
 *
 * Or for a span with both incoming and outgoing payloads:
 *   await spanPayload(span, "incoming_body", body);
 *   const result = await doWork();
 *   return spanPayload(span, "outgoing_response", result);
 */
export async function spanPayload<T>(
  span: SpanHandle,
  label: string,
  value: T,
): Promise<T> {
  const ref = await writePayload(span.trace_id, label, value);
  if (ref) {
    span.attr("payload_ref", ref);
  }
  return value;
}
