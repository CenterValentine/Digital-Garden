export default function Leaf1() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="220"
      height="220"
      viewBox="0 0 200 200"
    >
      <defs>
        <linearGradient
          id="leafMain"
          x1="60"
          y1="165"
          x2="150"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#57C84E" />
          <stop offset="1" stop-color="#A8EA6C" />
        </linearGradient>

        <linearGradient
          id="leafFold"
          x1="55"
          y1="165"
          x2="90"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stop-color="#3EAF43" />
          <stop offset="1" stop-color="#7FDD62" />
        </linearGradient>

        <filter id="glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feColorMatrix
            in="b"
            type="matrix"
            values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 0.30 0"
            result="g"
          />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Rotate the whole node to match the original tilt */}
      <g
        filter="url(#glow)"
        transform="translate(100 100) rotate(-22) translate(-100 -100)"
      >
        {/* Main "tag/parallelogram" leaf (NOT a diamond) */}
        <polygon points="78,40 152,55 132,168 58,153" fill="url(#leafMain)" />

        {/* Folded corner on lower-left */}
        <polygon
          points="58,153 78,168 92,142 72,132"
          fill="url(#leafFold)"
          opacity="0.98"
        />

        {/* Lightbulb icon (centered for new shape) */}
        <g
          transform="translate(0 2)"
          fill="none"
          stroke="#FFFFFF"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="7"
        >
          {/* Bulb glass */}
          <circle cx="112" cy="92" r="30" />
          {/* Filament */}
          <path d="M98 102 Q112 114 126 102" />
          <path d="M112 114 V124" />
          {/* Neck */}
          <path d="M104 124 H120" />
          {/* Base (3 ribs) */}
          <path d="M102 132 H122" />
          <path d="M104 142 H120" />
          <path d="M106 152 H118" />
        </g>
      </g>
    </svg>
  );
}
