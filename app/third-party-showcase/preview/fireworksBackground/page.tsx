"use client";

import { useState } from "react";
import { FireworksBackgroundDemo } from "@/components/client/third-party/animate-ui/FireworksBackgroundDemo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/client/ui/card";
import { ColorSelector } from "@/components/client/ui/utility/color-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";
import { Label } from "@/components/client/ui/label";
import type {
  DigitalGardenColor,
  ColorVariant,
} from "@/lib/design/integrations/colors";

// https://animate-ui.com/docs/components/backgrounds/fireworks

export default function FireworksBackgroundPreview() {
  const [selectedColor, setColor] = useState<DigitalGardenColor>("gold");
  const [colorVariant, setColorVariant] = useState<ColorVariant>("primary");

  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <FireworksBackgroundDemo
        className="h-screen"
        color={selectedColor}
        colorVariant={colorVariant}
        population={1}
      />

      {/* Control Panel */}
      <div className="absolute top-4 right-4 z-50">
        <Card className="w-64">
          <CardHeader>
            <CardTitle className="text-sm">Fireworks Controls</CardTitle>
            <CardDescription className="text-sm">
              Control the fireworks background with the following settings.
              Click anywhere on the screen to launch a fireworks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ColorSelector
              value={selectedColor}
              onValueChange={setColor}
              label="Theme Color"
            />
            <div className="space-y-2">
              <Label htmlFor="color-variant" className="text-sm">
                Color Variant
              </Label>
              <Select
                value={colorVariant}
                onValueChange={(value) =>
                  setColorVariant(value as ColorVariant)
                }
              >
                <SelectTrigger id="color-variant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="accent">Accent</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="mid">Mid</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="bright">Bright</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
