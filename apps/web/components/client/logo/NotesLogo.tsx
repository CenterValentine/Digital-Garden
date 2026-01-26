import Link from "next/link";
import CompactLogo from "./CompactLogo";

/**
 * NotesLogo - Minimal logo for the notes navbar
 *
 * Displays the medallion (56x56px) with the full CompactLogo animation
 * Uses the exact same logo as the home page navbar
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

      {/* Medallion with full animated CompactLogo */}
      <div className="relative h-14 w-14 flex items-center justify-center transition-transform group-hover:scale-105">
        {/* Medallion ring */}
        <div className="absolute inset-0 rounded-full border-2 border-gold-primary bg-gradient-to-br from-gold-light/30 to-shale-dark/40" />
        {/* Inner ring */}
        <div className="absolute inset-0.5 rounded-full border border-gold-dark/50 bg-background" />

        {/* CompactLogo - same as home page */}
        <div className="relative h-12 w-12 flex items-center justify-center z-10">
          <CompactLogo />
        </div>
      </div>

      {/* Placeholder for "G" - right side */}
      {/* <span className="text-gold-primary font-bold text-xl">G</span> */}
    </Link>
  );
}
