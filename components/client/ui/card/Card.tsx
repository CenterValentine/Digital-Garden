import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/core/utils";

const cardVariants = cva(
  "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border transition-all",
  {
    variants: {
      intent: {
        default: "border-border",
        highlight: "border-leaf-primary bg-leaf-primary/5",
        warning: "border-gold-dark bg-gold-dark/10",
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

const cardHeaderVariants = cva(
  "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"
);

const cardTitleVariants = cva("leading-none font-medium");

const cardDescriptionVariants = cva("text-muted-foreground");

const cardActionVariants = cva(
  "col-start-2 row-span-2 row-start-1 self-start justify-self-end"
);

const cardContentVariants = cva("px-6 [&:last-child]:pb-6");

const cardFooterVariants = cva("flex items-center px-6 pb-6 [.border-t]:pt-6");

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  intent?: "default" | "highlight" | "warning" | "error" | "shale" | "gold";
}

function Card({ intent, className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ intent }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(cardHeaderVariants(), className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <h4
      data-slot="card-title"
      className={cn(cardTitleVariants(), className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      className={cn(cardDescriptionVariants(), className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(cardActionVariants(), className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(cardContentVariants(), className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(cardFooterVariants(), className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
