/**
 * Testimonials
 * Source: https://ui.aceternity.com/components/testimonials
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface TestimonialsProps {
  className?: string;
  color?: DigitalGardenColor;
  testimonials?: Array<{ name: string; role: string; content: string }>;
}

export function Testimonials({
  className,
  color = "shale",
  testimonials = [],
}: TestimonialsProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {testimonials.map((testimonial, index) => (
        <div
          key={index}
          className="p-4 rounded-lg"
          style={{
            backgroundColor: `${getColorVariable(color, "primary")}20`,
          }}
        >
          <p>{testimonial.content}</p>
          <div>
            <strong>{testimonial.name}</strong>
            <span>{testimonial.role}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
