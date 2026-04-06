import Link from "next/link";
import StaticCompactLogo from "./StaticCompactLogo";

/**
 * NotesLogo - Minimal logo for the notes navbar
 *
 * Gold ring medallion (56px) with the static tree logo inside.
 *
 * The SVG is designed at 560px scale with 5px strokes. Displayed at 44px those
 * strokes collapse to ~0.4px (invisible at 1x density). Fix: render the SVG at
 * 176px internally, then use CSS transform to scale the wrapper down to 44px so
 * the browser rasterizes at full resolution before downscaling.
 */
export default function NotesLogo() {
  // Scale factor: 44 / 176 = 0.25 → strokes render at ~1.6px before downscale
  const RENDER_SIZE = 176;
  const DISPLAY_SIZE = 44;
  const scale = DISPLAY_SIZE / RENDER_SIZE;

  return (
    <Link
      href="/"
      className="flex items-center gap-2 group no-underline"
      aria-label="Digital Garden Home"
    >
      {/* Medallion ring */}
      <div className="h-14 w-14 rounded-full border-2 border-gold-primary flex items-center justify-center transition-transform group-hover:scale-105 bg-[var(--background)] shadow-[inset_0_0_0_1px_rgba(139,105,20,0.25)]">
        {/* Clipping wrapper sized to final display size */}
        <div
          style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE, overflow: "hidden", position: "relative" }}
        >
          {/* SVG rendered at RENDER_SIZE, scaled down to DISPLAY_SIZE */}
          <div
            style={{
              width: RENDER_SIZE,
              height: RENDER_SIZE,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <StaticCompactLogo />
          </div>
        </div>
      </div>
    </Link>
  );
}
