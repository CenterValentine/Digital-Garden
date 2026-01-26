/**
 * Animated Modal
 * Source: https://ui.aceternity.com/components/animated-modal
 */

"use client";

import { getColorVariable, type DigitalGardenColor } from "@/lib/third-party";
import { cn } from "@/lib/core/utils";

export interface AnimatedModalProps {
  className?: string;
  color?: DigitalGardenColor;
  isOpen?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function AnimatedModal({
  className,
  color = "shale",
  isOpen = false,
  onClose,
  children,
}: AnimatedModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        className
      )}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6"
        style={{
          backgroundColor: getColorVariable(color, "primary"),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
