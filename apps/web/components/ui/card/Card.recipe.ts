import { cva } from "class-variance-authority";

// Card variants matching Figma Make output with Digital Garden palette
export const cardVariants = cva(
  "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border transition-all",
  {
    variants: {
      intent: {
        default: "border-border",
        highlight:
          "border-leaf-primary bg-leaf-primary/5",
        warning:
          "border-gold-dark bg-gold-dark/10",
        error: "border-destructive bg-destructive/5",
        shale: "border-shale-mid bg-shale-dark/50 text-gold-light",
        gold: "border-gold-primary bg-gold-dark/20 text-gold-light",
      },
    },
    defaultVariants: {
      intent: "default",
    },
  }
);

export const cardHeaderVariants = cva(
  "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"
);

export const cardTitleVariants = cva("leading-none font-medium");

export const cardDescriptionVariants = cva("text-muted-foreground");

export const cardActionVariants = cva(
  "col-start-2 row-span-2 row-start-1 self-start justify-self-end"
);

export const cardContentVariants = cva("px-6 [&:last-child]:pb-6");

export const cardFooterVariants = cva(
  "flex items-center px-6 pb-6 [.border-t]:pt-6"
);
