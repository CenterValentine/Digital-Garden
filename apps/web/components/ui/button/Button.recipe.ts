import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // Base styles
  "inline-flex items-center justify-center rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-state-focus focus-visible:ring-offset-2 disabled:pointer-events-none",
  {
    variants: {
      intent: {
        primary:
          "bg-intent-primary text-white hover:bg-intent-primary/90 active:bg-intent-primary/80",
        secondary:
          "bg-intent-secondary text-white hover:bg-intent-secondary/90 active:bg-intent-secondary/80",
        accent:
          "bg-intent-accent text-white hover:bg-intent-accent/90 active:bg-intent-accent/80",
        danger:
          "bg-intent-danger text-white hover:bg-intent-danger/90 active:bg-intent-danger/80",
        ghost:
          "bg-transparent hover:bg-state-hover active:bg-state-active text-intent-neutral",
      },
      size: {
        small: "px-3 py-1.5 text-sm",
        medium: "px-4 py-2 text-base",
        large: "px-6 py-3 text-lg",
      },
      state: {
        default: "",
        disabled: "opacity-50 cursor-not-allowed",
        loading: "opacity-75 cursor-wait",
      },
    },
    defaultVariants: {
      intent: "primary",
      size: "medium",
      state: "default",
    },
  }
);
