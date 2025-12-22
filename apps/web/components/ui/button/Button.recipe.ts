import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // Base styles - matching Figma Make output
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Digital Garden specific variants
        leaf: "bg-leaf-primary text-white hover:bg-leaf-light shadow-glow-leaf",
        gold: "bg-gold-primary text-shale-dark hover:bg-gold-light shadow-glow-gold",
        shale: "bg-shale-mid text-gold-light hover:bg-shale-light",
        // Gradient variants - full height, no rounded corners
        "gradient-shale":
          "rounded-none bg-gradient-to-b from-shale-light via-shale-mid to-shale-dark text-gold-light hover:from-shale-mid hover:via-shale-dark hover:to-shale-dark",
        "gradient-gold":
          "rounded-none bg-gradient-to-b from-gold-light via-gold-primary to-gold-dark text-shale-dark hover:from-gold-primary hover:via-gold-dark hover:to-gold-dark",
        "gradient-leaf":
          "rounded-none bg-gradient-to-b from-leaf-bright via-leaf-light to-leaf-primary text-white hover:from-leaf-light hover:via-leaf-primary hover:to-leaf-primary shadow-glow-leaf",
        "gradient-mixed":
          "rounded-none bg-gradient-to-b from-gold-light via-shale-mid to-shale-dark text-gold-light hover:from-gold-primary hover:via-shale-dark hover:to-shale-dark",
        // NavBar variant - white background, gold gradient on hover, max height for 2:1 aspect
        "nav-item":
          "rounded-none bg-background text-foreground hover:bg-gradient-to-b hover:from-gold-light hover:via-gold-primary hover:to-gold-dark hover:text-white transition-all duration-300 max-h-12 my-auto",
        // Soft gold gradient - muted, elegant
        "gradient-gold-soft":
          "bg-gradient-to-b from-gold-light/80 via-gold-primary/70 to-gold-dark/60 text-shale-dark hover:from-gold-light hover:via-gold-primary hover:to-gold-dark transition-all duration-300",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
        // Full height variant for navbar
        full: "h-full px-6 py-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
