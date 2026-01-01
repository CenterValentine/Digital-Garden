/**
 * Hole Background Demo
 * Source: https://animate-ui.com/docs/components/backgrounds/hole
 * Hole background effect with smooth animated transitions
 */

"use client";

import {
  HoleBackground,
  type HoleBackgroundRef,
} from "@/components/third-party/animate-ui/components/backgrounds/hole";
import { cn } from "@/lib/utils";
import {
  getColorAsHex,
  getColorAsRgb,
  type DigitalGardenColor,
  type ColorVariant,
} from "@/lib/third-party/colors";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface HoleBackgroundDemoProps extends React.ComponentProps<"div"> {
  className?: string;
  color?: DigitalGardenColor;
  colorVariant?: ColorVariant;
  numberOfLines?: number;
  numberOfDiscs?: number;
  showControls?: boolean;
  reverse?: boolean;
}

export function HoleBackgroundDemo({
  className,
  color = "gold",
  colorVariant = "primary",
  numberOfLines = 50,
  numberOfDiscs = 50,
  showControls = false,
  reverse: initialReverse = false,
  ...props
}: HoleBackgroundDemoProps) {
  const [strokeColor, setStrokeColor] = useState<string>("#737373");
  const [particleRGBColor, setParticleRGBColor] = useState<
    [number, number, number]
  >([255, 255, 255]);
  const [reverse, setReverse] = useState<boolean>(initialReverse);
  const holeBackgroundRef = useRef<HoleBackgroundRef>(null);

  useEffect(() => {
    setStrokeColor(getColorAsHex(color, colorVariant));
    setParticleRGBColor(getColorAsRgb(color, colorVariant));
  }, [color, colorVariant]);

  // Sync reverse state with prop changes
  useEffect(() => {
    setReverse(initialReverse);
  }, [initialReverse]);

  const handleAddDisc = () => {
    // Let addDisc use its smart default based on reverse direction
    // When reverse=false: starts from outside (p=0) and shrinks inward
    // When reverse=true: starts from inside (p=1) and expands outward
    holeBackgroundRef.current?.addDisc({
      color: strokeColor,
    });
  };

  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{ height: "100%" }}
      {...props}
    >
      <HoleBackground
        ref={holeBackgroundRef}
        className="absolute inset-0 w-full h-full"
        strokeColor={strokeColor}
        particleRGBColor={particleRGBColor}
        numberOfLines={numberOfLines}
        numberOfDiscs={numberOfDiscs}
        horizontalLineColor={strokeColor}
        reverse={reverse}
      />
      {showControls && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100]"
          style={{ zIndex: 100 }}
        >
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl p-4 min-w-[320px] flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <Label
                htmlFor="reverse-toggle"
                className="text-sm font-medium cursor-pointer whitespace-nowrap text-gray-900 dark:text-gray-100"
              >
                Reverse Direction
              </Label>
              <Switch
                id="reverse-toggle"
                checked={reverse}
                onCheckedChange={setReverse}
              />
            </div>
            <Button
              onClick={handleAddDisc}
              variant="default"
              className="min-w-[160px]"
            >
              Add Disc
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
