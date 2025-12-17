"use client";

import React, { useEffect, useRef, useState } from "react";
import LogoDefs from "@/components/client/logo/logo-parts/Logo-Defs";
import { Crown } from "@/components/client/logo/logo-parts";
import { useLogoAnimation } from "@/components/client/logo/useLogoAnimation";

export default function CompactLogo() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [showCrown, setShowCrown] = useState(false);
  const crownRef = useRef<SVGGElement>(null);

  useLogoAnimation(svgRef, {
    speed: 4,
    runOnce: true,
    gapsMs: 0,
    drawJitterMs: 10,
    drawOverlap: 1,
    onComplete: () => setShowCrown(true),
  });

  useEffect(() => {
    if (!showCrown) return;
    const el = crownRef.current;
    if (!el) return;

    // Ensure scaling happens in place
    (el.style as any).transformBox = "fill-box";
    el.style.transformOrigin = "center";

    // Anchor point (SVG user units) for the root/shoot junction.
    const anchorX = 210.73;
    const anchorY = 300.91;

    // Crown SVG has width/height 220. We center it on the anchor at the final scale.
    const crownSize = 220;
    const finalScale = 0.2;
    const finalHalf = (crownSize * finalScale) / 2;

    const tx = anchorX - finalHalf;
    const ty = anchorY - finalHalf;

    const T = `translate(${tx}px, ${ty}px)`;

    el.style.opacity = "1";
    el.style.transform = `${T} scale(0)`;

    const durationMs = 120;
    const anim = (el as any).animate(
      [
        { transform: `${T} scale(0)`, opacity: 0 },
        {
          transform: `${T} scale(${finalScale * 1.12})`,
          opacity: 1,
          offset: 0.65,
        },
        {
          transform: `${T} scale(${finalScale * 0.96})`,
          opacity: 1,
          offset: 0.85,
        },
        { transform: `${T} scale(${finalScale})`, opacity: 1 },
      ],
      {
        duration: durationMs,
        easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
        fill: "forwards",
      }
    );

    // Fallback in case finish event isn't supported
    anim?.addEventListener?.("finish", () => {});
  }, [showCrown]);

  return (
    <svg
      ref={svgRef}
      id="compact-logo"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 560.86 540.14"
      width="48"
      height="48"
      className="w-full h-full"
    >
      <LogoDefs />
      <style>{`
  .shoot { stroke: url(#grad-shoot) !important; }
  .root  { stroke: url(#grad-root)  !important; }
`}</style>

      <g id="_rootSystem_" data-name="&amp;lt;rootSystem&amp;gt;">
        <polyline
          id="_root11_"
          className="root"
          data-name="&amp;lt;root11&amp;gt;"
          points="229.88 388.61 203.31 413.88 150.37 413.88 113.14 450.82"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node12_"
          className="root"
          data-name="&amp;lt;node12&amp;gt;"
          cx="105.66"
          cy="457.22"
          r="7.79"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root12_"
          className="root"
          data-name="&amp;lt;root12&amp;gt;"
          points="216.32 458.72 198.3 477.05 198.3 505.06"
          style={{
            stroke: "#e4c288",
            fill: "none",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_root12_-2"
          className="root"
          data-name="&amp;lt;root12&amp;gt;"
          points="280.86 396.21 292.34 406.49 292.34 453.9 310.41 473.06 310.41 515.95"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node13_"
          className="root"
          data-name="&amp;lt;node13&amp;gt;"
          cx="310.55"
          cy="524.21"
          r="6.53"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root13_"
          className="root"
          data-name="&amp;lt;root13&amp;gt;"
          points="329.33 390.21 355.95 413.88 411.84 413.88 448.78 450.82"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node14_"
          className="root"
          data-name="&amp;lt;node14&amp;gt;"
          cx="453.73"
          cy="457.29"
          r="6.93"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root14_"
          className="root"
          data-name="&amp;lt;root14&amp;gt;"
          points="346.32 458.72 362.36 477.05 362.36 503.83"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_root15_"
          className="root"
          data-name="&amp;lt;root15&amp;gt;"
          points="258.77 400.8 258.77 434.44 240.95 452.36 240.95 460.98"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_node16_"
          className="root"
          data-name="&amp;lt;node16&amp;gt;"
          points="209.53 503.71 209.53 489.28 240.95 458.72 240.95 473.99 234.07 481.22 234.07 502.5"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node17_"
          className="root"
          data-name="&amp;lt;node17&amp;gt;"
          cx="209.22"
          cy="512.72"
          r="6.48"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node17_-2"
          className="root"
          data-name="&amp;lt;node17&amp;gt;"
          cx="233.57"
          cy="509.24"
          r="4.78"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root18_"
          className="root"
          data-name="&amp;lt;roor18&amp;gt;"
          points="280.11 454.35 280.01 460.98 292.34 471.9"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_root18_"
          className="root"
          data-name="&amp;lt;root18&amp;gt;"
          cx="296.58"
          cy="475.03"
          r="4.77"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <path
          id="_root18_-2"
          className="root"
          data-name="&amp;lt;root18&amp;gt;"
          d="M280.01,460.98s-11.13,10.73-11.13,14.31c0,7.74,18.23,18.53,20.91,26.3.61,1.77.41,8.21-1.72,10.66-2.56,2.94-7.21,2.02-7.21,5.77,0,8.41-.26,20.13-.75,20.12"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root10_"
          className="root"
          data-name="&amp;lt;root10&amp;gt;"
          points="317.88 458.72 317.88 472.47 327.73 482.25 327.73 503.71"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "3px",
          }}
        />
        <circle
          id="_node11_"
          className="root"
          data-name="&amp;lt;node11&amp;gt;"
          cx="327.94"
          cy="509.55"
          r="4.48"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node10_"
          className="root"
          data-name="&amp;lt;node10&amp;gt;"
          cx="351.92"
          cy="512.25"
          r="5.77"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node10_-2"
          className="root"
          data-name="&amp;lt;node10&amp;gt;"
          cx="251.16"
          cy="524.47"
          r="5.27"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root9_reverse"
          className="root"
          data-name="&amp;lt;root9&amp;gt;"
          points="351.92 506.49 352.01 490.35 320.09 458.43"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root8_"
          className="root"
          data-name="&amp;lt;root8&amp;gt;"
          points="301.94 398.84 301.94 435.01 318.88 452.51 318.88 456.09"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node8_"
          className="root"
          data-name="&amp;lt;node8&amp;gt;"
          cx="220.42"
          cy="454.66"
          r="5.84"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node7_"
          className="root"
          data-name="&amp;lt;node7&amp;gt;"
          cx="155.64"
          cy="435.76"
          r="5.27"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node7_-2"
          className="root"
          data-name="&amp;lt;node7&amp;gt;"
          cx="405.32"
          cy="434.67"
          r="6.52"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root7_reverse"
          className="root"
          data-name="&amp;lt;root7&amp;gt;"
          points="250.84 518.02 250.84 471.43 268.91 453.64 268.91 406.21 279.52 398.84"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_root6a_"
          className="root"
          data-name="&amp;lt;root6a&amp;gt;"
          x1="362.36"
          y1="434.44"
          x2="397.94"
          y2="434.44"
          style={{
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_root6a_-2"
          className="root"
          data-name="&amp;lt;root6a&amp;gt;"
          x1="196.15"
          y1="435.76"
          x2="160.76"
          y2="435.76"
          style={{
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <path
          id="_root6_"
          className="root"
          data-name="&amp;lt;root6&amp;gt;"
          d="M279.92,380l.19,74.35-.19-74.35Z"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_root5_"
          className="root"
          data-name="&amp;lt;root5a&amp;gt;"
          points="320.39 394.44 380.15 452.36 412.18 452.36"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root6_-2"
          className="root"
          data-name="&amp;lt;root5a&amp;gt;"
          points="238.69 394.44 182.6 450.82 147.21 450.82"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node5_"
          className="root"
          data-name="&amp;lt;node5&amp;gt;"
          cx="391.95"
          cy="495.51"
          r="8.32"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node5_-2"
          className="root"
          data-name="&amp;lt;node5&amp;gt;"
          cx="171.19"
          cy="494.23"
          r="8.27"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_root4_"
          className="root"
          data-name="&amp;lt;root4&amp;gt;"
          x1="388.91"
          y1="477.05"
          x2="388.91"
          y2="486.96"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_root4_-2"
          className="root"
          data-name="&amp;lt;root4&amp;gt;"
          x1="171.55"
          y1="477.05"
          x2="171.55"
          y2="484.96"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <circle
          id="_node4_"
          className="root"
          data-name="&amp;lt;node4&amp;gt;"
          cx="428.33"
          cy="476.23"
          r="5.27"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node4_-2"
          className="root"
          data-name="&amp;lt;node4&amp;gt;"
          cx="129.8"
          cy="476.23"
          r="5.27"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root4_reverse"
          className="root"
          data-name="&amp;lt;root3&amp;gt;"
          points="422.79 475.29 384.76 475.29 318.88 411.67"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root3_reverse-2"
          className="root"
          data-name="&amp;lt;root3&amp;gt;"
          points="135.54 475.29 176.2 475.29 219.78 432.47 240.95 411.67"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root0_"
          className="root"
          data-name="&amp;lt;root0&amp;gt;"
          points="261.62 342.47 203.31 400.92 117.35 400.92"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root0_-2"
          className="root"
          data-name="&amp;lt;root0&amp;gt;"
          points="298.6 344.68 357.69 400.92 439.1 401.5 443.52 401.5"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node1_"
          className="root"
          data-name="&amp;lt;node1&amp;gt;"
          cx="451.1"
          cy="402.23"
          r="7.79"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root2_"
          className="root"
          data-name="&amp;lt;root1&amp;gt;"
          points="280.11 364.04 310.41 391.52 310.41 422.4 336.39 448.37"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root1_-2"
          className="root"
          data-name="&amp;lt;root1&amp;gt;"
          points="279.54 364.61 248.63 390.86 248.63 425.26 224.13 448.37"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node4_"
          className="root"
          data-name="&amp;lt;node&amp;gt;"
          cx="341.34"
          cy="453.9"
          r="6.08"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node2_"
          className="root"
          data-name="&amp;lt;node2&amp;gt;"
          cx="482.56"
          cy="401.45"
          r="7.79"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node1_-2"
          className="root"
          data-name="&amp;lt;node1&amp;gt;"
          cx="109.56"
          cy="401.45"
          r="7.79"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <circle
          id="_node2_-2"
          className="root"
          data-name="&amp;lt;node2&amp;gt;"
          cx="77.75"
          cy="400.92"
          r="7.79"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_root2_"
          className="root"
          data-name="&amp;lt;root2&amp;gt;"
          x1="101.76"
          y1="401.45"
          x2="85.54"
          y2="400.92"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_root2_-2"
          className="root"
          data-name="&amp;lt;root2&amp;gt;"
          x1="458.89"
          y1="402.23"
          x2="474.77"
          y2="401.45"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_root3_-3"
          className="root"
          data-name="&amp;lt;root3&amp;gt;"
          x1="69.96"
          y1="400.92"
          x2="2"
          y2="401.5"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_root3_-4"
          className="root"
          data-name="&amp;lt;root3&amp;gt;"
          x1="490.35"
          y1="401.45"
          x2="558.86"
          y2="401.5"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root5_"
          className="root"
          data-name="&amp;lt;root5&amp;gt;"
          points="140.75 401.84 117.35 425.93 85.54 425.93"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_root6_-2"
          className="root"
          data-name="&amp;lt;root6&amp;gt;"
          points="420.81 401.5 443.52 428.14 474.77 428.14"
          style={{
            fill: "none",
            stroke: "#e4c288",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
      </g>

      <g id="_shootSystem_" data-name="&amp;lt;shootSystem&amp;gt;">
        <line
          id="_start0_reverse"
          className="shoot"
          data-name="&amp;lt;start0&amp;gt;"
          x1="279.73"
          y1="378.91"
          x2="256.74"
          y2="400.8"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_start1_reverse-2"
          className="shoot"
          data-name="&amp;lt;start0&amp;gt;"
          points="279.73 378.91 283.12 381.92 304.95 402.44"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_start1_"
          className="shoot"
          data-name="&amp;lt;start1&amp;gt;"
          x1="279.73"
          y1="378.91"
          x2="279.52"
          y2="356.88"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <polyline
          id="_shoot1_"
          className="shoot"
          data-name="&amp;lt;shoot1&amp;gt;"
          points="279.54 360.74 279.54 279.01 316.77 247.9"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <circle
          id="_node2_-3"
          className="shoot"
          data-name="&amp;lt;node2&amp;gt;"
          cx="324.9"
          cy="238.94"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot2_"
          className="shoot"
          data-name="&amp;lt;shoot2&amp;gt;"
          points="279.54 323.57 279.73 272.56 253.56 246.77 227.96 268.98"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <circle
          id="_node3_"
          className="shoot"
          data-name="&amp;lt;node3&amp;gt;"
          cx="218.5"
          cy="276.42"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <line
          id="_shoot4_"
          className="shoot"
          data-name="&amp;lt;shoot4&amp;gt;"
          x1="280.86"
          y1="273.25"
          x2="210.08"
          y2="202.85"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <line
          id="_shoot5_"
          className="shoot"
          data-name="&amp;lt;shoot5&amp;gt;"
          x1="209.33"
          y1="203.23"
          x2="185.52"
          y2="203.38"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot5_-2"
          className="shoot"
          data-name="&amp;lt;shoot5&amp;gt;"
          points="279.54 278.16 279.54 224.51 331.68 180.7 331.68 135.71"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <circle
          id="_node6_"
          className="shoot"
          data-name="&amp;lt;node6&amp;gt;"
          cx="331.68"
          cy="124.42"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot6_"
          className="shoot"
          data-name="&amp;lt;shoot6&amp;gt;"
          points="279.54 228.02 279.54 169.74 243.69 134.02"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <circle
          id="_node7_-3"
          className="shoot"
          data-name="&amp;lt;node7&amp;gt;"
          cx="235.01"
          cy="125.25"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot7_"
          className="shoot"
          data-name="&amp;lt;shoot7&amp;gt;"
          points="279.54 176.94 279.54 124.42 280.11 98.63"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <polyline
          id="_shoot7_-2"
          className="shoot"
          data-name="&amp;lt;shoot7&amp;gt;"
          points="277.28 122.73 280.11 124.42 284.81 121.78 333.36 85.87"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <line
          id="_shoot7_-3"
          className="shoot"
          data-name="&amp;lt;shoot7&amp;gt;"
          x1="280.29"
          y1="125.93"
          x2="217.32"
          y2="75.28"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <circle
          id="_node6_-2"
          className="shoot"
          data-name="&amp;lt;node6&amp;gt;"
          cx="175.2"
          cy="203.96"
          r="10.32"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node8_-2"
          className="shoot"
          data-name="&amp;lt;node8&amp;gt;"
          cx="342.15"
          cy="79.25"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node8_-3"
          className="shoot"
          data-name="&amp;lt;node8&amp;gt;"
          cx="208.04"
          cy="68.78"
          r="10.46"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node9_"
          className="shoot"
          data-name="&amp;lt;node9&amp;gt;"
          cx="280.31"
          cy="79.49"
          r="15.68"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "7px",
          }}
        />
        <circle
          id="_node11_-2"
          className="shoot"
          data-name="&amp;lt;node11&amp;gt;"
          cx="238.29"
          cy="382.99"
          r="4.22"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "3px",
          }}
        />
        <circle
          id="_node11_-3"
          className="shoot"
          data-name="&amp;lt;node11&amp;gt;"
          cx="321.73"
          cy="382.99"
          r="4.22"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "3px",
          }}
        />
        <polyline
          id="_shoot12_"
          className="shoot"
          data-name="&amp;lt;shoot12&amp;gt;"
          points="317.52 378.77 296.86 359.34 296.86 235.29 391.35 159.05 421.09 143.81 422.98 142.87"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node13_-2"
          className="shoot"
          data-name="&amp;lt;node13&amp;gt;"
          cx="433.55"
          cy="136.59"
          r="12.47"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot13_"
          className="shoot"
          data-name="&amp;lt;shoot13&amp;gt;"
          points="241.71 378.91 262.6 359.71 263.54 286.89 225.33 247.9 164.34 247.9"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node14_-2"
          className="shoot"
          data-name="&amp;lt;node14&amp;gt;"
          cx="153.4"
          cy="247.28"
          r="9.94"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "4px",
          }}
        />
        <polyline
          id="_shoot14_"
          className="shoot"
          data-name="&amp;lt;shoot14&amp;gt;"
          points="354.83 187.29 354.83 159.24 364.25 132.51 364.25 130.82"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_shoot14_-2"
          className="shoot"
          data-name="&amp;lt;shoot14&amp;gt;"
          x1="374.6"
          y1="194.5"
          x2="347.42"
          y2="194.5"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_shoot14_-3"
          className="shoot"
          data-name="&amp;lt;shoot14&amp;gt;"
          x1="231.73"
          y1="223.94"
          x2="232.73"
          y2="182.53"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <circle
          id="_node15_"
          className="shoot"
          data-name="&amp;lt;node15&amp;gt;"
          cx="384.24"
          cy="192.85"
          r="8.62"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node15_-2"
          className="shoot"
          data-name="&amp;lt;node15&amp;gt;"
          cx="366.49"
          cy="120.53"
          r="9.13"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_shoot15_"
          className="shoot"
          data-name="&amp;lt;shoot15&amp;gt;"
          x1="373.09"
          y1="113.95"
          x2="400.2"
          y2="93.36"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node16_-2"
          className="shoot"
          data-name="&amp;lt;node16&amp;gt;"
          cx="410.28"
          cy="86.05"
          r="10.79"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <polyline
          id="_shoot15_-2"
          className="shoot"
          data-name="&amp;lt;shoot15&amp;gt;"
          points="210.08 202.85 210.08 173.55 196.53 132.14"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <polyline
          id="_shoot15_-3"
          className="shoot"
          data-name="&amp;lt;shoot15&amp;gt;"
          points="209.33 203.23 179.21 171.48 133.47 148.89 131.59 147.95"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <circle
          id="_node16_-3"
          className="shoot"
          data-name="&amp;lt;node16&amp;gt;"
          cx="119.77"
          cy="142.56"
          r="12.82"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node16_-4"
          className="shoot"
          data-name="&amp;lt;node16&amp;gt;"
          cx="193.99"
          cy="121.25"
          r="9.32"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_shoot16_"
          className="shoot"
          data-name="&amp;lt;shoot16&amp;gt;"
          x1="184.67"
          y1="115.54"
          x2="161.14"
          y2="104.47"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "6px",
          }}
        />
        <circle
          id="_node17_-3"
          className="shoot"
          data-name="&amp;lt;node17&amp;gt;"
          cx="149.77"
          cy="99.58"
          r="11.76"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <line
          id="_shoot17_"
          className="shoot"
          data-name="&amp;lt;shoot17&amp;gt;"
          x1="279.92"
          y1="64.94"
          x2="279.92"
          y2="23.9"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
        <circle
          id="_node18_"
          className="shoot"
          data-name="&amp;lt;node18&amp;gt;"
          cx="279.98"
          cy="13.2"
          r="10.7"
          style={{
            fill: "none",
            stroke: "#24415f",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "5px",
          }}
        />
      </g>
      <circle
        id="_node0_-4"
        className="shoot"
        data-name="&amp;lt;node11&amp;gt;"
        cx="253.15"
        cy="404.09"
        r="3.29"
        style={{
          fill: "none",
          stroke: "#24415f",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: "3px",
        }}
      />
      <circle
        id="_node0_-5"
        className="shoot"
        data-name="&amp;lt;node11&amp;gt;"
        cx="308.25"
        cy="406.21"
        r="3.29"
        style={{
          fill: "none",
          stroke: "#24415f",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: "3px",
        }}
      />
      {showCrown && (
        <g
          id="journalCrown"
          ref={crownRef}
          style={{
            opacity: 0,
            transform: "scale(0)",
            pointerEvents: "none",
          }}
        >
          <Crown />
        </g>
      )}
    </svg>
  );
}

