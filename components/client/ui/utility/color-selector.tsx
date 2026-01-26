"use client";

import type { DigitalGardenColor } from "@/lib/design/integrations/colors";
import { getColorVariable } from "@/lib/design/integrations/colors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";
import { Label } from "@/components/client/ui/label";

const availableColors: DigitalGardenColor[] = [
  "shale",
  "gold",
  "leaf",
  "neon-blue",
  "neon-gold",
  "neon-green",
] as const;

export interface ColorSelectorProps {
  value: DigitalGardenColor;
  onValueChange: (value: DigitalGardenColor) => void;
  label?: string;
  showPreview?: boolean;
  className?: string;
}

export function ColorSelector({
  value,
  onValueChange,
  label = "Theme Color",
  showPreview = true,
  className,
}: ColorSelectorProps) {
  return (
    <div className={className}>
      <Label className="text-sm font-medium mb-2 block">{label}</Label>
      <Select
        value={value}
        onValueChange={(val) => onValueChange(val as DigitalGardenColor)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a theme color" />
        </SelectTrigger>
        <SelectContent>
          {availableColors.map((color) => (
            <SelectItem key={color} value={color}>
              <div className="flex items-center gap-2">
                {showPreview && (
                  <div
                    className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                    style={{
                      backgroundColor: getColorVariable(color, "primary"),
                    }}
                  />
                )}
                <span className="capitalize">{color.replace("-", " ")}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Export the available colors array for use in other components
export { availableColors };
