/**
 * Fullscreen Visualization Layout
 *
 * Bypasses the normal three-panel content layout.
 * Just renders children directly for true fullscreen experience.
 */

export default function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
