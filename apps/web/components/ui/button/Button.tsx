import * as React from "react";
import { buttonVariants } from "./Button.recipe";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "small" | "medium" | "large";
  state?: "default" | "disabled" | "loading";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ intent, size, state, className, disabled, ...props }, ref) => {
    const isDisabled = disabled || state === "disabled" || state === "loading";

    return (
      <button
        className={cn(buttonVariants({ intent, size, state }), className)}
        ref={ref}
        disabled={isDisabled}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
