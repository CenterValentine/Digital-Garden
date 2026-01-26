/**
 * Timeline ⭐⭐⭐
 * Source: https://ui.aceternity.com/components/timeline
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface TimelineProps {
  className?: string;
  color?: DigitalGardenColor;
  items?: Array<{ title: string; description: string; date: string }>;
}

export function Timeline({
  className,
  color = "shale",
  items = [],
}: TimelineProps) {
  return (
    <div className={cn("relative", className)}>
      {items.map((item, index) => (
        <div key={index} className="relative flex gap-4">
          <div
            className="w-4 h-4 rounded-full"
            style={{
              backgroundColor: getColorVariable(color, "primary"),
            }}
          />
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span>{item.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
