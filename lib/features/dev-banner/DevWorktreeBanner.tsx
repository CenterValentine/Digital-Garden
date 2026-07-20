import type { CSSProperties } from "react";

import { composeWorktreeLabel, getWorktreeIdentity } from "./identity";

/**
 * Styles are inline rather than Tailwind classes on purpose. This component gets
 * cherry-picked across every active worktree, each sitting at a different commit
 * with a potentially different Tailwind/globals.css state. Inline styles have no
 * build-time dependency at all, so the banner renders identically everywhere it
 * lands — including on branches predating any given design-token change.
 *
 * Mid-grey at low opacity reads on both the light and dark shells without the
 * component needing to know anything about the theme.
 */
const BANNER_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  // Above every app layer (modals top out far below this) but under the
  // 2147483647 ceiling, leaving headroom for devtools overlays.
  zIndex: 2147483000,
  padding: "2px 7px",
  borderTopRightRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 10,
  lineHeight: 1.5,
  letterSpacing: "0.02em",
  color: "rgba(128, 128, 128, 0.95)",
  background: "rgba(128, 128, 128, 0.14)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  // Never intercept a click, a drag, or a text selection — the banner sits over
  // real UI and must be incapable of getting in the way.
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap",
};

/**
 * Dev-only marker naming the worktree/branch this localhost is serving.
 *
 * Returns null before touching the filesystem in any non-development build, so
 * production pages neither render it nor bail out of static generation.
 */
export async function DevWorktreeBanner() {
  if (process.env.NODE_ENV !== "development") return null;

  const identity = await getWorktreeIdentity();
  if (!identity) return null;

  return (
    <div aria-hidden style={BANNER_STYLE}>
      {composeWorktreeLabel(identity)}
    </div>
  );
}
