"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/core/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Track geometry: h-5 (20px) with border-2 leaves a 16px content box,
      // which the 16px thumb fills exactly — so `translate-x-4` is the full
      // travel and the thumb stays optically centred. Don't resize one of
      // these three without the other two.
      //
      // The unchecked track used to be `bg-input`, but --input is
      // `transparent` in both themes: every "off" switch rendered as a
      // track-less floating thumb. --switch-track is a dedicated token —
      // --muted was the obvious candidate but it's a *surface* token
      // (#ececf0) and vanishes against a white page. As a UI component the
      // track owes 3:1 (WCAG 1.4.11), which this clears in both themes.
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-switch-track",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Thumb stays white in both themes (the iOS/Material convention):
        // it has to read against --muted when off and --primary when on,
        // and those swap lightness between themes. `bg-background` made it
        // a slate thumb on a slate page in dark mode.
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
