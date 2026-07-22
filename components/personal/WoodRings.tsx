"use client";

/**
 * WoodRings — renders one organic tree-ring medallion as deterministic SVG.
 *
 * Client component so ResumePage's RSC payload doesn't have to serialize
 * a nested server component tree (which caused blank pages on client-side
 * navigation). All geometry is pure math — no server APIs needed.
 */

import {
  organicPath,
  RING_FILLS,
  RING_STROKES,
  PITH_FILL,
} from "@/lib/personal/woodRings";

interface WoodRingsProps {
  cx: number;
  cy: number;
  /** Outermost ring first; length = number of eras. */
  radii: number[];
  width: number;
  height: number;
  /** Per-medallion phase offset so each diagram wobbles differently. */
  seed?: number;
}

export function WoodRings({
  cx,
  cy,
  radii,
  width,
  height,
  seed = 0,
}: WoodRingsProps) {
  const grainCount = 20;
  const outer = radii[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="ce-ring"
      aria-hidden="true"
    >
      {/* main wood-tone bands */}
      {radii.map((r, i) => (
        <path
          key={`band-${i}`}
          d={organicPath(cx, cy, r, i * 1.7 + seed)}
          fill={RING_FILLS[i]}
          stroke={RING_STROKES[i]}
          strokeWidth="0.9"
        />
      ))}

      {/* radial grain lines */}
      {Array.from({ length: grainCount }, (_, i) => {
        const a = (i / grainCount) * Math.PI * 2 - Math.PI / 2;
        return (
          <line
            key={`grain-${i}`}
            x1={cx}
            y1={cy}
            x2={(cx + outer * Math.cos(a)).toFixed(1)}
            y2={(cy + outer * Math.sin(a)).toFixed(1)}
            stroke="rgba(139,89,40,0.07)"
            strokeWidth="0.4"
          />
        );
      })}

      {/* intermediate fine rings between main bands */}
      {radii.slice(0, -1).map((r, i) => {
        const rm = (r + radii[i + 1]) / 2;
        return (
          <path
            key={`fine-${i}`}
            d={organicPath(cx, cy, rm, i * 2.3 + 5.1)}
            fill="none"
            stroke="rgba(139,89,40,0.055)"
            strokeWidth="0.6"
          />
        );
      })}

      {/* pith dot */}
      <circle cx={cx} cy={cy} r={radii.length > 1 ? 3 : 2.5} fill={PITH_FILL} />
    </svg>
  );
}
