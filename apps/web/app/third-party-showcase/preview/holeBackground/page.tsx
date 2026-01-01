"use client";

import { HoleBackgroundDemo } from "@/components/third-party/animate-ui/HoleBackgroundDemo";

// https://animate-ui.com/docs/components/backgrounds/hole

export default function HoleBackgroundPreview() {
  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <HoleBackgroundDemo
        className="h-screen"
        color="gold"
        colorVariant="primary"
        numberOfLines={50}
        numberOfDiscs={90}
        showControls={true}
        reverse={false}
      />
    </div>
  );
}
