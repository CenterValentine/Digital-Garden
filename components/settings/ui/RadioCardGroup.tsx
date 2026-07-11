"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { Label } from "@/components/client/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/client/ui/radio-group";
import { cn } from "@/lib/core/utils";

export interface RadioCardOption<T extends string> {
  value: T;
  /** Required — every option must have a visible name. */
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

interface RadioCardGroupProps<T extends string> {
  value: T | undefined;
  onValueChange: (value: T) => void;
  options: Array<RadioCardOption<T>>;
  columns?: 1 | 2 | 3;
  "aria-label"?: string;
  className?: string;
}

/**
 * Card-style radio list: title + description per option, whole card
 * clickable, keyboard navigation via Radix RadioGroup semantics.
 */
export function RadioCardGroup<T extends string>({
  value,
  onValueChange,
  options,
  columns = 1,
  className,
  ...rest
}: RadioCardGroupProps<T>) {
  const groupId = useId();

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      className={cn(
        "grid gap-2",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        className
      )}
      {...rest}
    >
      {options.map((option) => {
        const itemId = `${groupId}-${option.value}`;
        const isSelected = value === option.value;
        return (
          <Label
            key={option.value}
            htmlFor={itemId}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors",
              "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5",
              isSelected && "border-primary/50 bg-primary/5 dark:bg-primary/10",
              option.disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <RadioGroupItem
              id={itemId}
              value={option.value}
              disabled={option.disabled}
              className="mt-0.5"
            />
            {option.icon && (
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {option.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium leading-tight">
                {option.title}
                {option.badge}
              </span>
              {option.description && (
                <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
