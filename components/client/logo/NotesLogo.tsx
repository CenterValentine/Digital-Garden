import Link from "next/link";
import StaticCompactLogo from "./StaticCompactLogo";

/**
 * NotesLogo - Minimal logo for the notes navbar
 *
 * Displays the medallion (56x56px) with the static (non-animated) logo.
 * Uses StaticCompactLogo so the tree is always visible without relying on
 * the draw animation, which can fail to render on desktop.
 *
 * Future enhancement: Add "D" on left, "G" on right of medallion
 */
export default function NotesLogo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 group no-underline"
      aria-label="Digital Garden Home"
    >
      {/* Placeholder for "D" - left side */}
      {/* <span className="text-gold-primary font-bold text-xl">D</span> */}

      {/* Medallion with static logo */}
      <div className="relative h-14 w-14 flex items-center justify-center transition-transform group-hover:scale-105">
        {/* Medallion ring */}
        <div className="absolute inset-0 rounded-full border-2 border-gold-primary bg-gradient-to-br from-gold-light/30 to-shale-dark/40" />
        {/* Inner ring */}
        <div className="absolute inset-0.5 rounded-full border border-gold-dark/50 bg-background" />

        {/* StaticCompactLogo - always visible, no draw animation */}
        <div className="relative h-12 w-12 flex items-center justify-center z-10">
          <StaticCompactLogo />
        </div>
      </div>

      {/* Placeholder for "G" - right side */}
      {/* <span className="text-gold-primary font-bold text-xl">G</span> */}
    </Link>
  );
}
