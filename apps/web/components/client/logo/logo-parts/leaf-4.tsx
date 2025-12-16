import React from "react";

/**
 * Leaf4 Component
 *
 * A leaf-shaped SVG icon with an embedded lightbulb symbol.
 * The leaf uses a curved path to create an organic, triangular leaf shape
 * with a gradient fill transitioning from darker green to bright lime green.
 *
 * Features:
 * - Curved leaf shape using cubic Bezier curves
 * - Linear gradient from dark to light green
 * - Centered lightbulb icon with circular background
 * - Clean, modern design suitable for eco-tech branding
 */
export default function Leaf4({
  className = "",
  size = 200,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Gradient for the leaf - dark green to bright lime */}
        <linearGradient id="leafGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a9d5f" />
          <stop offset="50%" stopColor="#6bc47d" />
          <stop offset="100%" stopColor="#b4ff39" />
        </linearGradient>
      </defs>

      {/* Leaf shape - curved triangular form */}
      <path
        d="M 100 20 Q 150 40, 170 100 Q 160 150, 100 180 Q 90 150, 60 100 Q 70 50, 100 20 Z"
        fill="url(#leafGradient)"
        opacity="0.95"
      />

      {/* White circle background for lightbulb */}
      <circle cx="100" cy="100" r="35" fill="white" opacity="0.9" />

      {/* Lightbulb icon */}
      <g transform="translate(100, 100)">
        {/* Bulb glass */}
        <path
          d="M -12 -8 Q -12 -20, 0 -20 Q 12 -20, 12 -8 Q 12 2, 8 8 L -8 8 Q -12 2, -12 -8 Z"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Bulb base/socket */}
        <rect
          x="-8"
          y="8"
          width="16"
          height="8"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          rx="1"
        />

        {/* Socket lines */}
        <line x1="-8" y1="11" x2="8" y2="11" stroke="white" strokeWidth="2.5" />
        <line x1="-8" y1="14" x2="8" y2="14" stroke="white" strokeWidth="2.5" />

        {/* Filament */}
        <path
          d="M 0 -15 L 0 -5"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
