import React from "react";

export default function LogoDefs() {
  return (
    <defs>
      <linearGradient
        id="grad-shoot"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2="0"
        y2="300"
      >
        <stop offset="0%" stopColor="#4FAE8A" />
        <stop offset="100%" stopColor="#2F6F6A" />
      </linearGradient>

      <linearGradient
        id="grad-root"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="300"
        x2="0"
        y2="540.14"
      >
        <stop offset="0%" stopColor="#E2C27A" />
        <stop offset="100%" stopColor="#B88B3E" />
      </linearGradient>

      <linearGradient
        id="grad-white"
        gradientUnits="userSpaceOnUse"
        x1="0"
        y1="0"
        x2="0"
        y2="100%"
      >
        <stop offset="0%" stopColor="#f6f2e8" />
        <stop offset="100%" stopColor="#FFFFFF" />
      </linearGradient>

      {/* soft ios shadow - Dark Mode*/}
      <filter
        id="soft-ios-shadow-dark"
        x="-50%"
        y="-50%"
        width="200%"
        height="200%"
        colorInterpolationFilters="sRGB"
      >
        {/* soft vertical blur  */}
        <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur" />

        {/* subtle downward offset */}
        <feOffset in="blur" dx="0" dy="6" result="offsetBlur" />

        {/* low-opacity shadow */}
        <feColorMatrix
          in="offsetBlur"
          type="matrix"
          values="
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 0.18 0"
          result="shadow"
        />

        {/* merge shadow + original */}
        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* soft ios shadow - Light Mode*/}

      <filter
        id="soft-ios-shadow-light"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        filterUnits="objectBoundingBox"
      >
        {/* Shadow */}
        <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur" />

        <feOffset in="blur" dx="0" dy="10" result="offsetBlur" />

        <feColorMatrix
          in="offsetBlur"
          type="matrix"
          values="
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 0 0
      0 0 0 0.18 0
    "
          result="shadow"
        />

        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
