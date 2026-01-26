"use client";

import React from "react";
// flag for consolidation of layout and nav components

import { IntegratedCircuitNav } from "@/components/client/app-nav/IntegratedCircuitNav";
import { BranchPresetName } from "@/lib/features/navigation/branch-builder";
import type { NavigationTree } from "@/lib/features/navigation/navigation";

interface AppNavProps {
  navigationData?: NavigationTree;
}

export default function AppNav({ navigationData }: AppNavProps) {
  const [mounted, setMounted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [scrollRotation, setScrollRotation] = React.useState<
    number | undefined
  >(undefined);
  const [dimensions, setDimensions] = React.useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  // Only render on client to avoid hydration mismatches
  React.useEffect(() => {
    setMounted(true);

    // Update dimensions on mount and resize
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // auto-scroll
  React.useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setProgress((p) => (p + 0.002) % 1);
    }, 16);
    return () => clearInterval(interval);
  }, [mounted]);

  // Scroll-based navigation tree rotation override
  React.useEffect(() => {
    if (!mounted) return;
    let scrollY = 0;
    const rotationSensitivity = 0.5; // Degrees per pixel scrolled

    const handleScroll = (e: WheelEvent) => {
      scrollY += e.deltaY * rotationSensitivity;
      // Keep rotation in a reasonable range (can be negative for reverse scrolling)
      setScrollRotation(scrollY);
    };

    window.addEventListener("wheel", handleScroll, { passive: true });
    return () => window.removeEventListener("wheel", handleScroll);
  }, [mounted]);

  // Convert navigation data to branch configs
  const branchDepthConfigs = React.useMemo(() => {
    if (!navigationData?.categories) return [];

    return navigationData.categories.map((category, index) => ({
      branchId: index,
      config: category.preset as BranchPresetName,
    }));
  }, [navigationData]);

  // Don't render until mounted to avoid hydration mismatches
  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-screen"></div>
    );
  }

  return (
    <div className="w-full h-full fixed inset-0">
      <IntegratedCircuitNav
        progress={progress}
        containerWidth={dimensions.width}
        containerHeight={dimensions.height}
        branchDepthConfigs={branchDepthConfigs}
        navigationData={navigationData}
        scrollRotation={scrollRotation}
        onNodeClick={(data) =>
          console.log(
            "Clicked branch:",
            data.branchId,
            "at",
            data.yPercent + "%"
          )
        }
      />
    </div>
  );
}
