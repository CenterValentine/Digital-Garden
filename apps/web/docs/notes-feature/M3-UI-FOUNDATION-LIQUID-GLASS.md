# M3: UI Foundation with Liquid Glass Design System

**Milestone:** M3 - UI Foundation  
**Design System:** Liquid Glass (Glass-UI + DiceUI for `/notes/**`)  
**Version:** 2.0  
**Last Updated:** January 12, 2026

## Overview

M3 builds the foundational UI layer for the Notes Feature using the **Liquid Glass design system**. This includes panel layout, state management, design tokens, and core components styled with Glass-UI.

**Key Difference from Standard Implementation:**
- Uses **Glass-UI** (primary) + **DiceUI** (fallback) instead of shadcn/Radix
- Implements **DS facade** for consistent API across `/notes/**` and rest of app
- Applies **Liquid Glass aesthetic** with conservative motion rules
- Follows **metaphor budget** (Level 0-2) appropriate for IDE-like experience

---

## Prerequisites

**Completed:**
- ✅ M1: Foundation & Database (ContentNode v2.0, seed script, core utilities)
- ✅ M2: Core API Routes (CRUD, file upload, storage providers, tree navigation)

**Required:**
- Next.js 16+ running
- PostgreSQL configured
- Prisma client generated (`npx prisma generate`)
- Authentication system functional

---

## Phase 1: Design System Foundation

### Step 1.1: Install Design System Dependencies

```bash
cd apps/web

# Glass-UI and DiceUI
pnpm add @glass-ui/react @dice-ui/react

# Panel layout and virtualization
pnpm add allotment @tanstack/react-virtual

# State management
pnpm add zustand

# Icons (if not already installed)
pnpm add lucide-react
```

### Step 1.2: Create Design Token System

**File:** `lib/design-system/surfaces.ts`

```typescript
/**
 * Surface Tokens - Liquid Glass
 * 
 * Three-tier glass surface system for depth and hierarchy.
 * Used across ALL routes (not just /notes/**).
 */

export const surfaces = {
  "glass-0": {
    // Base canvas (minimal blur)
    background: "rgba(255, 255, 255, 0.02)",
    backdropBlur: "8px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    shadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  },
  "glass-1": {
    // Elevated cards (medium blur)
    background: "rgba(255, 255, 255, 0.04)",
    backdropBlur: "12px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    shadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  "glass-2": {
    // Modal overlays (strong blur)
    background: "rgba(255, 255, 255, 0.06)",
    backdropBlur: "16px",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    shadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
} as const;

export type Surface = keyof typeof surfaces;

// Dark mode adjustments
export const surfacesDark = {
  "glass-0": {
    background: "rgba(0, 0, 0, 0.3)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
  },
  "glass-1": {
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },
  "glass-2": {
    background: "rgba(0, 0, 0, 0.5)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
  },
} as const;
```

**File:** `lib/design-system/intents.ts`

```typescript
/**
 * Semantic Intent Colors
 * 
 * Unified color intent system across all routes.
 */

export const intents = {
  primary: "hsl(222, 47%, 51%)",     // Blue
  secondary: "hsl(222, 13%, 45%)",   // Gray-blue
  neutral: "hsl(215, 14%, 34%)",     // Neutral gray
  danger: "hsl(0, 72%, 51%)",        // Red
  success: "hsl(142, 71%, 45%)",     // Green
  warning: "hsl(38, 92%, 50%)",      // Orange
  info: "hsl(199, 89%, 48%)",        // Cyan
} as const;

export type Intent = keyof typeof intents;
```

**File:** `lib/design-system/motion.ts`

```typescript
/**
 * Motion Rules - Conservative
 * 
 * Restrained animations for professional IDE experience.
 */

export const motion = {
  durations: {
    fast: 150,    // ms
    base: 200,
    slow: 300,
  },
  
  easings: {
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",  // ease-out
    snappy: "cubic-bezier(0.4, 0, 0.6, 1)",  // custom snap
  },
  
  // Allowed transforms
  allowed: {
    opacity: true,
    translateX: true,
    translateY: true,
    scale: { min: 0.95, max: 1.05 }, // Subtle only
  },
  
  // Banned transforms
  banned: {
    rotate: true,        // Except icon spin
    skew: true,
    dropShadow: true,    // Except icons
    glow: true,
  },
} as const;

// CSS helper
export function transition(
  property: string | string[],
  duration: keyof typeof motion.durations = "base",
  easing: keyof typeof motion.easings = "smooth"
): string {
  const props = Array.isArray(property) ? property.join(", ") : property;
  return `${props} ${motion.durations[duration]}ms ${motion.easings[easing]}`;
}
```

**File:** `lib/design-system/index.ts`

```typescript
export * from "./surfaces";
export * from "./intents";
export * from "./motion";
```

### Step 1.3: Create DS Facade Structure

**File:** `components/ds/types.ts`

```typescript
/**
 * Unified Design System Types
 * 
 * These types are used by both Glass-UI and shadcn implementations.
 */

import type { Intent, Surface } from "@/lib/design-system";

export interface ButtonProps {
  intent?: Intent;
  surface?: Surface;
  size?: "sm" | "md" | "lg";
  variant?: "solid" | "outline" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}

export interface CardProps {
  surface?: Surface;
  padding?: "none" | "sm" | "md" | "lg";
  border?: boolean;
  hover?: boolean;
  children: React.ReactNode;
  className?: string;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface?: Surface;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  surface?: Surface;
  tabs: Array<{
    value: string;
    label: string;
    icon?: React.ReactNode;
  }>;
  children: React.ReactNode;
}
```

**File:** `components/ds/button/button-notes.tsx`

```typescript
/**
 * Button - Glass-UI Implementation (for /notes/**)
 */

"use client";

import { Button as GlassButton } from "@glass-ui/react";
import { cn } from "@/lib/utils";
import { surfaces, intents } from "@/lib/design-system";
import type { ButtonProps } from "../types";

export function ButtonNotes({
  intent = "primary",
  surface = "glass-1",
  size = "md",
  variant = "solid",
  disabled = false,
  loading = false,
  fullWidth = false,
  children,
  onClick,
  type = "button",
  className,
}: ButtonProps) {
  const surfaceStyles = surfaces[surface];
  const intentColor = intents[intent];
  
  return (
    <GlassButton
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        // Base styles
        "relative inline-flex items-center justify-center",
        "font-medium transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        
        // Size variants
        size === "sm" && "text-sm px-3 py-1.5 rounded",
        size === "md" && "text-base px-4 py-2 rounded-md",
        size === "lg" && "text-lg px-6 py-3 rounded-lg",
        
        // Surface + variant styles
        variant === "solid" && [
          "text-white",
          `background: ${intentColor}`,
          "hover:opacity-90",
        ],
        variant === "outline" && [
          `color: ${intentColor}`,
          surfaceStyles.border,
          "hover:bg-opacity-5",
        ],
        variant === "ghost" && [
          `color: ${intentColor}`,
          "hover:bg-opacity-5",
        ],
        
        // Glass surface
        surface && surfaceStyles.backdropBlur && [
          `backdrop-blur-[${surfaceStyles.backdropBlur}]`,
        ],
        
        // Full width
        fullWidth && "w-full",
        
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed",
        
        // Loading state
        loading && "cursor-wait",
        
        // Custom classes
        className
      )}
    >
      {loading && (
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </GlassButton>
  );
}
```

**File:** `components/ds/button/index.tsx`

```typescript
/**
 * Button - Route-aware export
 */

"use client";

import { usePathname } from "next/navigation";
import { ButtonNotes } from "./button-notes";
// import { ButtonApp } from "./button-app"; // For non-/notes/** routes

export function Button(props: React.ComponentProps<typeof ButtonNotes>) {
  const pathname = usePathname();
  
  // Route-based selection
  if (pathname.startsWith("/notes")) {
    return <ButtonNotes {...props} />;
  }
  
  // TODO: Implement ButtonApp for rest of application
  return <ButtonNotes {...props} />;
}

// Re-export types
export type { ButtonProps } from "../types";
```

---

## Phase 2: Panel Layout System

### Step 2.1: Create Panel Layout Store

**File:** `stores/panel-store.ts`

```typescript
/**
 * Panel Layout State
 * 
 * Manages panel widths, visibility, and layout persistence.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PanelState {
  // Left sidebar
  leftSidebarVisible: boolean;
  leftSidebarWidth: number;
  
  // Right sidebar
  rightSidebarVisible: boolean;
  rightSidebarWidth: number;
  
  // Status bar
  statusBarVisible: boolean;
  
  // Actions
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  toggleStatusBar: () => void;
  
  // Reset
  resetLayout: () => void;
}

const DEFAULT_STATE = {
  leftSidebarVisible: true,
  leftSidebarWidth: 280,
  rightSidebarVisible: true,
  rightSidebarWidth: 300,
  statusBarVisible: true,
};

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,
      
      toggleLeftSidebar: () =>
        set((state) => ({ leftSidebarVisible: !state.leftSidebarVisible })),
      
      toggleRightSidebar: () =>
        set((state) => ({ rightSidebarVisible: !state.rightSidebarVisible })),
      
      setLeftSidebarWidth: (width) =>
        set({ leftSidebarWidth: Math.max(200, Math.min(600, width)) }),
      
      setRightSidebarWidth: (width) =>
        set({ rightSidebarWidth: Math.max(200, Math.min(600, width)) }),
      
      toggleStatusBar: () =>
        set((state) => ({ statusBarVisible: !state.statusBarVisible })),
      
      resetLayout: () => set(DEFAULT_STATE),
    }),
    {
      name: "notes-panel-layout",
    }
  )
);
```

### Step 2.2: Create Panel Layout Component

**File:** `components/notes/PanelLayout.tsx`

```typescript
/**
 * Panel Layout - Obsidian-inspired IDE layout
 * 
 * Uses Allotment for resizable panels with Glass-UI styling.
 */

"use client";

import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { usePanelStore } from "@/stores/panel-store";
import { cn } from "@/lib/utils";
import { surfaces } from "@/lib/design-system";

interface PanelLayoutProps {
  leftSidebar: React.ReactNode;
  mainContent: React.ReactNode;
  rightSidebar: React.ReactNode;
  statusBar: React.ReactNode;
}

export function PanelLayout({
  leftSidebar,
  mainContent,
  rightSidebar,
  statusBar,
}: PanelLayoutProps) {
  const {
    leftSidebarVisible,
    leftSidebarWidth,
    rightSidebarVisible,
    rightSidebarWidth,
    statusBarVisible,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = usePanelStore();
  
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main panel area */}
      <div className="flex-1 overflow-hidden">
        <Allotment
          onChange={(sizes) => {
            if (leftSidebarVisible) {
              setLeftSidebarWidth(sizes[0]);
            }
          }}
        >
          {/* Left sidebar */}
          {leftSidebarVisible && (
            <Allotment.Pane
              minSize={200}
              maxSize={600}
              preferredSize={leftSidebarWidth}
              className={cn(
                "overflow-hidden",
                "border-r",
                surfaces["glass-0"].border
              )}
              style={{
                background: surfaces["glass-0"].background,
                backdropFilter: `blur(${surfaces["glass-0"].backdropBlur})`,
              }}
            >
              {leftSidebar}
            </Allotment.Pane>
          )}
          
          {/* Main content area */}
          <Allotment.Pane>
            <Allotment
              vertical={false}
              onChange={(sizes) => {
                if (rightSidebarVisible) {
                  const rightIndex = leftSidebarVisible ? 1 : 0;
                  setRightSidebarWidth(sizes[rightIndex]);
                }
              }}
            >
              <Allotment.Pane>{mainContent}</Allotment.Pane>
              
              {/* Right sidebar */}
              {rightSidebarVisible && (
                <Allotment.Pane
                  minSize={200}
                  maxSize={600}
                  preferredSize={rightSidebarWidth}
                  className={cn(
                    "overflow-hidden",
                    "border-l",
                    surfaces["glass-0"].border
                  )}
                  style={{
                    background: surfaces["glass-0"].background,
                    backdropFilter: `blur(${surfaces["glass-0"].backdropBlur})`,
                  }}
                >
                  {rightSidebar}
                </Allotment.Pane>
              )}
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>
      
      {/* Status bar */}
      {statusBarVisible && (
        <div
          className={cn(
            "h-6 border-t px-4 py-1 text-xs",
            surfaces["glass-0"].border
          )}
          style={{
            background: surfaces["glass-0"].background,
            backdropFilter: `blur(${surfaces["glass-0"].backdropBlur})`,
          }}
        >
          {statusBar}
        </div>
      )}
    </div>
  );
}
```

---

## Phase 3: Core Components

### Step 3.1: Create Card Component

**File:** `components/ds/card/card-notes.tsx`

```typescript
"use client";

import { cn } from "@/lib/utils";
import { surfaces } from "@/lib/design-system";
import type { CardProps } from "../types";

export function CardNotes({
  surface = "glass-1",
  padding = "md",
  border = true,
  hover = false,
  children,
  className,
}: CardProps) {
  const surfaceStyles = surfaces[surface];
  
  return (
    <div
      className={cn(
        "rounded-lg transition-all duration-200",
        
        // Padding variants
        padding === "none" && "p-0",
        padding === "sm" && "p-3",
        padding === "md" && "p-4",
        padding === "lg" && "p-6",
        
        // Border
        border && surfaceStyles.border,
        
        // Hover effect
        hover && "hover:scale-[1.01] hover:shadow-lg",
        
        className
      )}
      style={{
        background: surfaceStyles.background,
        backdropFilter: `blur(${surfaceStyles.backdropBlur})`,
        boxShadow: surfaceStyles.shadow,
      }}
    >
      {children}
    </div>
  );
}
```

### Step 3.2: Create Dialog Component

**File:** `components/ds/dialog/dialog-notes.tsx`

```typescript
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaces } from "@/lib/design-system";
import type { DialogProps } from "../types";

export function DialogNotes({
  open,
  onOpenChange,
  surface = "glass-2",
  title,
  description,
  children,
  footer,
}: DialogProps) {
  const surfaceStyles = surfaces[surface];
  
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        
        {/* Content */}
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50",
            "w-full max-w-lg translate-x-[-50%] translate-y-[-50%]",
            "rounded-lg p-6 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
            surfaceStyles.border
          )}
          style={{
            background: surfaceStyles.background,
            backdropFilter: `blur(${surfaceStyles.backdropBlur})`,
          }}
        >
          {/* Header */}
          {title && (
            <div className="mb-4">
              <DialogPrimitive.Title className="text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-gray-500">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          )}
          
          {/* Body */}
          <div className="mb-4">{children}</div>
          
          {/* Footer */}
          {footer && <div className="flex justify-end gap-2">{footer}</div>}
          
          {/* Close button */}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

---

## Testing & Validation

### Visual Regression Tests

```typescript
// __tests__/visual/panel-layout.visual.test.tsx

import { test, expect } from "@playwright/test";

test.describe("Panel Layout", () => {
  test("renders with default layout", async ({ page }) => {
    await page.goto("/notes");
    await expect(page).toHaveScreenshot("panel-layout-default.png");
  });
  
  test("hides left sidebar", async ({ page }) => {
    await page.goto("/notes");
    await page.click("[data-testid=toggle-left-sidebar]");
    await expect(page).toHaveScreenshot("panel-layout-no-left.png");
  });
  
  test("applies glass surfaces correctly", async ({ page }) => {
    await page.goto("/notes");
    
    const leftSidebar = page.locator("[data-testid=left-sidebar]");
    const backdropFilter = await leftSidebar.evaluate((el) =>
      window.getComputedStyle(el).backdropFilter
    );
    
    expect(backdropFilter).toContain("blur");
  });
});
```

### Manual Testing Checklist

- [ ] Panel resizing works smoothly
- [ ] Sidebar toggle persists across page loads (Zustand)
- [ ] Glass surfaces render with correct blur
- [ ] Hover states are subtle (no rotation, no glow)
- [ ] Motion is conservative (200ms max)
- [ ] Dark mode applies correct surface adjustments
- [ ] No banned patterns (glow, neon, excessive rotation)

---

## Next Steps

**M4: File Tree**
- Virtualized tree with react-arborist
- Glass-UI styled tree nodes
- Drag-and-drop with optimistic updates
- Custom icon picker dialog

**M5: Content Editors & Viewers**
- TipTap editor with glass chrome
- Markdown mode toggle
- File viewers (PDF, images, etc.)
- Syntax highlighting with Shiki

---

## Documentation References

- **Design System**: `LIQUID-GLASS-DESIGN-SYSTEM.md`
- **Type Safety**: `TYPE-SAFETY-IMPROVEMENTS.md`
- **Tree Updates**: `TREE-UPDATE-FLOW.md`
- **API Spec**: `04-api-specification.md`

---

## Summary

✅ Design token system (surfaces, intents, motion)  
✅ DS facade structure for route-aware components  
✅ Panel layout with Allotment + Glass surfaces  
✅ Core components (Button, Card, Dialog) with Glass-UI  
✅ Zustand state management with persistence  
✅ Testing strategy with visual regression  

**Result:** Solid foundation for building `/notes/**` UI with Liquid Glass aesthetic.

