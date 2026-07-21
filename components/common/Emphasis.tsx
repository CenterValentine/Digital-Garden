/**
 * Emphasis — renders an emphasis string into the site's font tiers.
 *
 *   plain        → primary (serif)
 *   *italic*     → accent tier   (<em>)
 *   **bold**     → third tier    (<strong>)
 *
 * Shared deliberately by the public renderer (WorkResultsPage) AND the
 * composer's editing preview, so what you see while authoring is produced by
 * the exact same parser that renders the live page. Keep it dependency-free.
 */

export function parseEmphasis(
  text: string,
): { tier: "plain" | "accent" | "bold"; text: string }[] {
  const parts: { tier: "plain" | "accent" | "bold"; text: string }[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ tier: "plain", text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) parts.push({ tier: "bold", text: tok.slice(2, -2) });
    else parts.push({ tier: "accent", text: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ tier: "plain", text: text.slice(last) });
  return parts;
}

export function Emphasis({ text }: { text: string }) {
  return (
    <>
      {parseEmphasis(text).map((p, i) => {
        if (p.tier === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.tier === "accent") return <em key={i}>{p.text}</em>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}
