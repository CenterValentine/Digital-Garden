import Link from "next/link";
import CompactLogo from "./CompactLogo";

export default function NavBarLogo() {
  return (
    <div
      id="center-logo"
      className="
          absolute
          left-1/2
          -translate-x-1/2
          top-0 flex
          items-center
          justify-center mt-1 before:content-['']
          before:absolute before:left-1/2 before:-translate-x-1/2
           before:top-[65px]
           before:w-32 before:h-16 before:rounded-b-full
           before:shadow-[0_1px_2px_0_rgba(0,0,0,0.05),0_2px_4px_0_rgba(0,0,0,0.04),0_4px_8px_0_rgba(0,0,0,0.03)]
           before:pointer-events-none before:z-[90]"
    >
      <Link
        href="/"
        className="absolute top-0 flex items-start justify-center no-underline group z-[101]"
      >
        {/* White background circle - sized to just contain text with minimal gap */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-background" />

        {/* SVG with curved text - sized to match background */}
        <svg viewBox="0 0 100 100" className="w-32 h-32 relative z-10">
          <defs>
            {/*
                    Arc positioning guide:
                    - The "50" is the Y position (vertical center of viewBox)
                    - INCREASE to move text DOWN, DECREASE to move UP
                    - The "35 35" is the arc radius - smaller = tighter curve
                    - "15" and "85" are left/right X endpoints
                  */}
            {/* Arc for "David's" - shifted down to sit just above medallion */}
            <path
              id="textArcTop"
              d="M 15 40 A 25 25 0 0 1 85 50"
              fill="none"
            />
            {/* Arc for "Digital Garden" - shifted down to sit just below medallion */}
            <path
              id="textArcBottom"
              d="M 9 73 A 45 45 0 0 0 89 73"
              fill="none"
            />
          </defs>

          {/* "David's" curved on top - 3x size */}
          <text
            fontSize="12.75"
            fontWeight="1000"
            letterSpacing="1.5"
            style={{ fill: "var(--gold-primary)" }}
          >
            <textPath href="#textArcTop" startOffset="50%" textAnchor="middle">
              David&apos;s
            </textPath>
          </text>

          {/* "Digital Garden" curved on bottom */}
          <text
            fontSize="11"
            fontWeight="600"
            letterSpacing="1"
            style={{ fill: "var(--gold-primary)" }}
          >
            <textPath
              href="#textArcBottom"
              startOffset="50%"
              textAnchor="middle"
            >
              Digital Garden
            </textPath>
          </text>
        </svg>

        {/* Medallion centered - fills most of center, minimal gap to text */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="relative h-24 w-24 flex items-center justify-center">
            {/* Medallion ring */}
            <div className="absolute inset-0 rounded-full border-2 border-gold-primary bg-gradient-to-br from-gold-light/30 to-shale-dark/40" />
            {/* Inner ring */}
            <div className="absolute inset-0.5 rounded-full border border-gold-dark/50 bg-background" />
            {/* Logo container */}
            <div className="relative h-20 w-20 flex items-center justify-center z-10">
              <CompactLogo />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
