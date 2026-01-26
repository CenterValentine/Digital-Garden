"use client";

import { GravityStarsBackgroundDemo } from "@/components/client/third-party/animate-ui/GravityStarsBackgroundDemo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/client/ui/card";
import type {
  DigitalGardenColor,
  ColorVariant,
} from "@/lib/third-party/colors";
import { ColorSelector } from "@/components/client/ui/utility/color-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/client/ui/collapsible";

import { Button } from "@/components/client/ui/button";

import { Settings2, ChevronLeft } from "lucide-react";

import { Label } from "@/components/client/ui/label";

import { Switch } from "@/components/client/ui/switch";
import { Slider } from "@/components/client/ui/slider";
import { useState } from "react";

import { cn } from "@/lib/core/utils";

// https://animate-ui.com/docs/components/backgrounds/gravity-stars

export default function GravityStarsBackgroundPreview() {
  // state for controls:

  const [starsCount, setStarsCount] = useState(75);
  const [glowIntensity, setGlowIntensity] = useState(5);
  const [movementSpeed, setMovementSpeed] = useState(1);
  const [mouseInfluence, setMouseInfluence] = useState(100);
  const [mouseGravity, setMouseGravity] = useState<"attract" | "repel">(
    "attract"
  );
  const [gravityStrength, setGravityStrength] = useState(100);
  const [starsInteraction, setStarsInteraction] = useState(false);
  const [starsInteractionType, setStarsInteractionType] = useState<
    "bounce" | "merge"
  >("bounce");
  const [color, setColor] = useState<DigitalGardenColor>("gold");
  const [colorVariant, setColorVariant] = useState<ColorVariant>("primary");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="w-full h-screen min-h-screen relative"
      style={{ height: "100vh" }}
    >
      <GravityStarsBackgroundDemo
        className="h-screen"
        starsCount={starsCount}
        glowIntensity={glowIntensity}
        movementSpeed={movementSpeed}
        mouseInfluence={mouseInfluence}
        mouseGravity={mouseGravity}
        gravityStrength={gravityStrength}
        starsInteraction={starsInteraction}
        starsInteractionType={starsInteractionType}
        color={color}
        colorVariant={colorVariant}
      />

      {/* Control Panel */}

      <div className="absolute top-4 right-4 z-50">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-start gap-2">
            {/* Collapsed Icon Button */}
            <div className="p-2">
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-10 w-10 rounded-full border-2 border-gray-300 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all",
                    isOpen && "opacity-0 pointer-events-none"
                  )}
                >
                  <Settings2 className="h-5 w-5" />
                  <span className="sr-only">Toggle controls</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            {/* Expanded Control Panel */}
            <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="max-h-[90vh] overflow-y-auto">
                <Card className="w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-gray-300 dark:border-gray-700 shadow-2xl">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">
                          Gravity Stars Controls
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          Adjust the gravity stars background settings
                        </CardDescription>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="sr-only">Close controls</span>
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 max-h-[calc(90vh-120px)] overflow-y-auto">
                    {/* Color Selection */}
                    <div className="space-y-4">
                      <ColorSelector
                        value={color}
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
                    </div>

                    {/* Star Count */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="stars-count" className="text-sm">
                          Star Count
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {starsCount}
                        </span>
                      </div>
                      <Slider
                        id="stars-count"
                        min={10}
                        max={200}
                        step={5}
                        value={[starsCount]}
                        onValueChange={(value) => setStarsCount(value[0])}
                      />
                    </div>

                    {/* Glow Intensity */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="glow-intensity" className="text-sm">
                          Glow Intensity
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {glowIntensity}
                        </span>
                      </div>
                      <Slider
                        id="glow-intensity"
                        min={1}
                        max={20}
                        step={0.5}
                        value={[glowIntensity]}
                        onValueChange={(value) => setGlowIntensity(value[0])}
                      />
                    </div>

                    {/* Movement Speed */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="movement-speed" className="text-sm">
                          Movement Speed
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {movementSpeed}
                        </span>
                      </div>
                      <Slider
                        id="movement-speed"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={[movementSpeed]}
                        onValueChange={(value) => setMovementSpeed(value[0])}
                      />
                    </div>

                    {/* Mouse Influence */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="mouse-influence" className="text-sm">
                          Mouse Influence
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {mouseInfluence}
                        </span>
                      </div>
                      <Slider
                        id="mouse-influence"
                        min={0}
                        max={300}
                        step={10}
                        value={[mouseInfluence]}
                        onValueChange={(value) => setMouseInfluence(value[0])}
                      />
                    </div>

                    {/* Mouse Gravity */}
                    <div className="space-y-2">
                      <Label htmlFor="mouse-gravity" className="text-sm">
                        Mouse Gravity
                      </Label>
                      <Select
                        value={mouseGravity}
                        onValueChange={(value) =>
                          setMouseGravity(value as "attract" | "repel")
                        }
                      >
                        <SelectTrigger id="mouse-gravity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="attract">Attract</SelectItem>
                          <SelectItem value="repel">Repel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Gravity Strength */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="gravity-strength" className="text-sm">
                          Gravity Strength
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {gravityStrength}
                        </span>
                      </div>
                      <Slider
                        id="gravity-strength"
                        min={0}
                        max={200}
                        step={5}
                        value={[gravityStrength]}
                        onValueChange={(value) => setGravityStrength(value[0])}
                      />
                    </div>

                    {/* Stars Interaction */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="stars-interaction" className="text-sm">
                          Stars Interaction
                        </Label>
                        <Switch
                          id="stars-interaction"
                          checked={starsInteraction}
                          onCheckedChange={setStarsInteraction}
                        />
                      </div>
                      {starsInteraction && (
                        <div className="space-y-2">
                          <Label htmlFor="interaction-type" className="text-sm">
                            Interaction Type
                          </Label>
                          <Select
                            value={starsInteractionType}
                            onValueChange={(value) =>
                              setStarsInteractionType(
                                value as "bounce" | "merge"
                              )
                            }
                          >
                            <SelectTrigger id="interaction-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bounce">Bounce</SelectItem>
                              <SelectItem value="merge">Merge</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
