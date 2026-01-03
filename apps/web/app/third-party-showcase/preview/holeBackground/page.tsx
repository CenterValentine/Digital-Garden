"use client";

import { HoleBackgroundDemo } from "@/components/client/third-party/animate-ui/HoleBackgroundDemo";
import type { HoleBackgroundRef } from "@/components/client/third-party/animate-ui/components/backgrounds/hole";
import { Button } from "@/components/client/ui/button";
import { Card, CardContent } from "@/components/client/ui/card";
import { Label } from "@/components/client/ui/label";
import { Switch } from "@/components/client/ui/switch";
import { useRef, useState } from "react";
import { getColorAsHex } from "@/lib/third-party/colors";

// https://animate-ui.com/docs/components/backgrounds/hole

export default function HoleBackgroundPreview() {
  const [reverse, setReverse] = useState<boolean>(false);
  const holeBackgroundRef = useRef<HoleBackgroundRef>(null);
  const color = "gold";
  const colorVariant = "primary";

  const handleAddDisc = () => {
    const strokeColor = getColorAsHex(color, colorVariant);
    holeBackgroundRef.current?.addDisc({
      color: strokeColor,
    });
  };

  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <HoleBackgroundDemo
        ref={holeBackgroundRef}
        className="h-screen"
        color={color}
        colorVariant={colorVariant}
        numberOfLines={50}
        numberOfDiscs={50}
        reverse={reverse}
      />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[50] pointer-events-auto">
        <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-gray-300 dark:border-gray-700 shadow-2xl">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <Label
                htmlFor="reverse-toggle"
                className="text-sm font-medium cursor-pointer whitespace-nowrap text-foreground"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
