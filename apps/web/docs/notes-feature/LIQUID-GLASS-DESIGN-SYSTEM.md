# Liquid Glass Design System Strategy

**Version:** 1.0  
**Scope:** `/notes/**` routes with unified token system  
**Last Updated:** January 12, 2026

## Executive Summary

The Notes Feature adopts a **dual-component-registry strategy** with **unified design tokens**:

- **`/notes/**`: Uses Glass-UI + DiceUI (shadcn-compatible registries) for modern, fluid IDE experience
- **Rest of app**: Uses standard shadcn/ui components with matching surface tokens
- **Both**: Share same semantic intents, surfaces, motion rules, and typography

**Key Principle:** Different component sources, identical visual language.

**Important:** Glass-UI and DiceUI are **shadcn-compatible component registries**, not separate npm packages. Components are added using `shadcn` CLI and copied into your project.

---

## 1. Scope Boundary (Authoritative Rule)

### A) `/notes/**` Routes (Greenfield Territory)

**Component Registries:**

- ✅ **Primary**: Glass-UI components (liquid glass aesthetic, shadcn-compatible)
- ✅ **Fallback**: DiceUI components (when Glass-UI lacks primitive, shadcn-compatible)
- ⚠️ **Last Resort**: Standard shadcn/ui (only if both above missing)

**Installation Pattern:**

```bash
# Glass-UI components (verify availability in M4+)
pnpm dlx shadcn@latest add @glass-ui/button
pnpm dlx shadcn@latest add @glass-ui/card

# DiceUI components (registry verification needed)
# Known issue: Returns 404 error as of Jan 2026
# npx shadcn@latest add "@diceui/command"

# Standard shadcn (reliable fallback)
npx shadcn@latest add button
npx shadcn@latest add card
```

**Current Status:**

- Glass-UI: To be verified in M4 when components are needed
- DiceUI: Registry URL returns 404 (investigating alternative installation)
- Standard shadcn: Always available as fallback

**Design Constraints:**

- ✅ Use Glass-0/1/2 surface tokens
- ✅ Apply semantic intents (primary/secondary/neutral/danger/success/warning/info)
- ✅ Follow conservative motion rules (opacity/translate, subtle scale)
- ❌ No glow utilities
- ❌ No rotation-heavy hover patterns
- ❌ No neon accent stacking
- ❌ No multiple primary CTAs per view region

**Metaphor Budget:**

- **Level 0–1** (suppressed/hint): Editor canvas, tables, forms
- **Level 1–2** (hint/expressive): Navigation, tree views, knowledge exploration
- **Level 2** (expressive): Onboarding, discovery experiences

### B) Outside `/notes/**` (Existing App)

**Component Registry:**

- ✅ **Primary**: Standard shadcn/ui components (existing implementation)
- ✅ Apply same Glass-0/1/2 surface tokens via styling/variants
- ❌ **Do NOT** introduce Glass-UI or DiceUI components outside `/notes/**`

**Installation Pattern:**

```bash
# Standard shadcn/ui
npx shadcn@latest add button
npx shadcn@latest add card
```

**Design Constraints:**

- ✅ Use same surface tokens as `/notes/**`
- ✅ Match motion rules and durations
- ✅ Share semantic intent system
- ❌ Don't import Glass-UI or DiceUI

---

## 2. Unified Design Token System

### Surface Tokens (Global)

All routes use these three surface levels:

```typescript
// Shared surface tokens
export const surfaces = {
  "glass-0": {
    // Base canvas (subtle blur)
    background: "rgba(var(--surface-glass-0-bg))",
    backdropBlur: "8px",
    border: "1px solid rgba(var(--surface-glass-0-border))",
    shadow: "var(--shadow-glass-sm)",
  },
  "glass-1": {
    // Elevated cards (medium blur)
    background: "rgba(var(--surface-glass-1-bg))",
    backdropBlur: "12px",
    border: "1px solid rgba(var(--surface-glass-1-border))",
    shadow: "var(--shadow-glass-md)",
  },
  "glass-2": {
    // Modal overlays (strong blur)
    background: "rgba(var(--surface-glass-2-bg))",
    backdropBlur: "16px",
    border: "1px solid rgba(var(--surface-glass-2-border))",
    shadow: "var(--shadow-glass-lg)",
  },
};
```

### Semantic Intents (Global)

```typescript
export const intents = {
  primary: "hsl(var(--intent-primary))",
  secondary: "hsl(var(--intent-secondary))",
  neutral: "hsl(var(--intent-neutral))",
  danger: "hsl(var(--intent-danger))",
  success: "hsl(var(--intent-success))",
  warning: "hsl(var(--intent-warning))",
  info: "hsl(var(--intent-info))",
};
```

### Motion Rules (Global)

```typescript
export const motion = {
  durations: {
    fast: "150ms",
    base: "200ms",
    slow: "300ms",
  },
  easings: {
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
    snappy: "cubic-bezier(0.4, 0, 0.6, 1)",
  },
  allowed: [
    "opacity",
    "transform: translate*",
    "transform: scale(0.95-1.05)", // Subtle only
  ],
  banned: [
    "transform: rotate*", // Except icon spin
    "filter: drop-shadow*",
    "box-shadow: *glow*",
  ],
};
```

### Typography Scale (Global)

```typescript
export const typography = {
  scale: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.25,
    base: 1.5,
    relaxed: 1.75,
  },
};
```

---

## 3. Design System Facade (Compatibility Layer)

### Strategy: Unified Component API

Create a facade that exports the same prop interface regardless of underlying implementation.

**File structure:**

```
apps/web/components/ds/
├── button/
│   ├── index.tsx              # Route-aware export
│   ├── button-notes.tsx       # Glass-UI implementation
│   └── button-app.tsx         # shadcn implementation
├── card/
│   ├── index.tsx
│   ├── card-notes.tsx
│   └── card-app.tsx
├── dialog/
├── tabs/
├── command/
└── types.ts                   # Shared prop interfaces
```

### Unified Prop Interface

```typescript
// components/ds/types.ts

export type Intent =
  | "primary"
  | "secondary"
  | "neutral"
  | "danger"
  | "success"
  | "warning"
  | "info";

export type Surface = "glass-0" | "glass-1" | "glass-2";

export interface ButtonProps {
  intent?: Intent;
  surface?: Surface;
  size?: "sm" | "md" | "lg";
  variant?: "solid" | "outline" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export interface CardProps {
  surface?: Surface;
  padding?: "none" | "sm" | "md" | "lg";
  border?: boolean;
  children: React.ReactNode;
}
```

### Implementation Example: Button

```typescript
// components/ds/button/button-notes.tsx (Glass-UI)
import { Button as GlassButton } from "@glass-ui/react";
import type { ButtonProps } from "../types";

export function ButtonNotes({ intent, surface, ...props }: ButtonProps) {
  return (
    <GlassButton
      intent={intent}
      surface={surface}
      className="liquid-glass-button"
      {...props}
    />
  );
}
```

```typescript
// components/ds/button/button-app.tsx (shadcn)
import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ButtonProps } from "../types";

export function ButtonApp({ intent, surface, ...props }: ButtonProps) {
  return (
    <ShadcnButton
      className={cn(
        "transition-all duration-200",
        surface === "glass-1" && "bg-glass-1 backdrop-blur-md",
        intent === "primary" && "bg-primary hover:bg-primary/90",
        // ... map intent/surface to shadcn classes
      )}
      {...props}
    />
  );
}
```

```typescript
// components/ds/button/index.tsx (Route-aware export)
"use client";

import { usePathname } from "next/navigation";
import { ButtonNotes } from "./button-notes";
import { ButtonApp } from "./button-app";
import type { ButtonProps } from "../types";

export function Button(props: ButtonProps) {
  const pathname = usePathname();

  // Route-based component selection
  if (pathname.startsWith("/notes")) {
    return <ButtonNotes {...props} />;
  }

  return <ButtonApp {...props} />;
}
```

**Alternative: Build-time selection (preferred for performance)**

```typescript
// Use path aliases in next.config.ts
export default {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/components/ds": path.resolve(__dirname, "components/ds-app"),
    };

    // Override for /notes/** routes
    if (process.env.ROUTE === "notes") {
      config.resolve.alias["@/components/ds"] = path.resolve(
        __dirname,
        "components/ds-notes"
      );
    }

    return config;
  },
};
```

---

## 4. Library Priority Rules for `/notes/**`

When building UI in `/notes/**`, follow this decision tree:

```
Need a component?
       ↓
┌──────────────────────────────────┐
│ 1. Check Glass-UI                │
│    Does it exist?                │
│    → YES: Use Glass-UI           │
│    → NO: Go to step 2            │
└──────────────────────────────────┘
       ↓
┌──────────────────────────────────┐
│ 2. Check DiceUI (Fallback)       │
│    Does it exist?                │
│    → YES: Use DiceUI             │
│    → NO: Go to step 3            │
└──────────────────────────────────┘
       ↓
┌──────────────────────────────────┐
│ 3. shadcn/Radix (Last Resort)   │
│    Use sparingly                 │
│    Style to match Glass surfaces │
└──────────────────────────────────┘
```

### Component Availability Matrix

| Component | Glass-UI | DiceUI | shadcn | Recommendation                     |
| --------- | -------- | ------ | ------ | ---------------------------------- |
| Button    | ✅       | ✅     | ✅     | **Glass-UI**                       |
| Card      | ✅       | ✅     | ✅     | **Glass-UI**                       |
| Dialog    | ✅       | ✅     | ✅     | **Glass-UI**                       |
| Tabs      | ✅       | ❌     | ✅     | **Glass-UI**                       |
| Command   | ❌       | ✅     | ✅     | **DiceUI**                         |
| Tree      | ❌       | ❌     | ❌     | **react-arborist** (custom styled) |
| Editor    | ❌       | ❌     | ❌     | **TipTap** (custom styled)         |

### Mixing Libraries (Avoid When Possible)

**Bad:**

```tsx
<GlassCard>
  <ShadcnButton /> {/* Mixed libraries in same subtree */}
</GlassCard>
```

**Good:**

```tsx
<GlassCard>
  <GlassButton /> {/* Consistent library */}
</GlassCard>
```

**Acceptable (isolated wrapper):**

```tsx
<GlassCard>
  <TreeView>
    {" "}
    {/* Custom component */}
    <ShadcnDropdown /> {/* Isolated in subtree */}
  </TreeView>
</GlassCard>
```

---

## 5. Metaphor Budget for `/notes/**`

The Notes Feature is an **IDE-like experience** focused on productivity. Metaphor levels shift accordingly:

### Level 0–1: Suppressed/Hint (Default for Work Surfaces)

**Use for:**

- Editor canvas
- Content tables
- Forms and inputs
- Settings panels

**Visual characteristics:**

- Minimal decoration
- Subtle glass surfaces
- Focus on content, not chrome
- Gentle opacity transitions only

**Example:**

```tsx
<EditorCanvas surface="glass-0">
  <TextEditor /> {/* No metaphor, pure function */}
</EditorCanvas>
```

### Level 1–2: Hint/Expressive (Navigation & Discovery)

**Use for:**

- File tree navigation
- Sidebar panels
- Search results
- Backlinks panel

**Visual characteristics:**

- Slightly more pronounced glass effects
- Hover states with subtle scale
- Gentle border highlights
- Icon color transitions

**Example:**

```tsx
<FileTree surface="glass-1">
  <TreeNode hover="scale(1.02)" /> {/* Subtle metaphor */}
</FileTree>
```

### Level 2: Expressive (Onboarding Only)

**Use for:**

- Welcome screens
- Feature discovery
- First-time user experience
- Empty states with CTA

**Visual characteristics:**

- Stronger glass effects
- More pronounced transitions
- Illustrative icons
- Guided interactions

**Example:**

```tsx
<WelcomeDialog surface="glass-2">
  <IllustratedCTA /> {/* Expressive metaphor */}
</WelcomeDialog>
```

### Metaphor Rules Summary

```typescript
const metaphorLevels = {
  editor: 0, // Suppressed
  form: 0, // Suppressed
  table: 1, // Hint
  navigation: 1, // Hint
  fileTree: 1, // Hint
  sidebar: 1, // Hint
  search: 1, // Hint
  modal: 1, // Hint
  onboarding: 2, // Expressive
  empty: 2, // Expressive
  discovery: 2, // Expressive
};
```

---

## 6. Practical Guardrails (Enforcement)

### Allowed in `/notes/**`

**Components:**

- ✅ Glass-UI primitives (Button, Card, Dialog, Tabs, etc.)
- ✅ DiceUI fallbacks (Command, specific blocks)
- ✅ Custom styled components (Tree, Editor)

**Styles:**

- ✅ Glass surfaces (blur, border highlight)
- ✅ Opacity transitions
- ✅ Translate transforms
- ✅ Scale (0.95–1.05 only, subtle)
- ✅ Semantic intent colors
- ✅ Conservative shadows

### Banned Everywhere

**Effects:**

- ❌ `glow` utilities
- ❌ `neon-*` classes
- ❌ `drop-shadow-[*]` (except icons)
- ❌ `animate-pulse`
- ❌ `rotate-*` (except icon spin)

**Patterns:**

- ❌ Multiple primary CTAs per view
- ❌ Competing focal points
- ❌ Excessive blur (>20px)
- ❌ Ornamental animations

### CI Checks (Automated)

```bash
# Check for banned patterns
#!/bin/bash

# Banned classes
BANNED_PATTERNS=(
  "neon-glow"
  "shadow-glow"
  "rotate-(?!icon)" # Allow icon rotation only
  "animate-pulse"
  "drop-shadow-\["
)

for pattern in "${BANNED_PATTERNS[@]}"; do
  echo "Checking for banned pattern: $pattern"
  rg "$pattern" apps/web/app/notes/ && exit 1 || true
done

echo "✅ No banned patterns found"
```

### Code Review Checklist

**For `/notes/**` PRs:\*\*

- [ ] Uses Glass-UI or DiceUI (not shadcn)
- [ ] Follows surface token system (glass-0/1/2)
- [ ] Applies semantic intents correctly
- [ ] Motion is conservative (no rotation, subtle scale)
- [ ] Metaphor level appropriate for context
- [ ] No glow or neon effects
- [ ] Screenshot included for visual changes

**For non-`/notes/**` PRs:\*\*

- [ ] Uses shadcn/Radix only
- [ ] Applies same surface tokens
- [ ] Matches motion rules
- [ ] No Glass-UI/DiceUI imports

---

## 7. Implementation Roadmap

### Phase 1: Foundation (M3 - UI Foundation)

**Tasks:**

1. Create design token definitions
   - `lib/design-system/surfaces.ts`
   - `lib/design-system/intents.ts`
   - `lib/design-system/motion.ts`

2. Build DS facade structure
   - `components/ds/button/`
   - `components/ds/card/`
   - `components/ds/dialog/`

3. Implement Glass-UI versions for `/notes/**`
   - Button with surface + intent props
   - Card with glass surfaces
   - Dialog with backdrop blur

4. Create layout components
   - PanelLayout (Allotment)
   - Sidebar (collapsible)
   - TabBar (content switching)

**Deliverables:**

- Design token system
- 5-10 core DS components
- Layout primitives
- Documentation

### Phase 2: Notes-Specific Components (M4 - File Tree)

**Tasks:**

1. File tree with Glass-UI styling
2. Tree node with hover states
3. Icon picker dialog
4. Context menu

**Deliverables:**

- Virtualized tree component
- Drag-and-drop support
- Custom icon system
- Glass-styled overlays

### Phase 3: Editor Experience (M5 - Editors & Viewers)

**Tasks:**

1. TipTap editor with glass chrome
2. Markdown toolbar
3. File viewer components
4. PDF viewer integration

**Deliverables:**

- Rich text editor
- Markdown mode
- File viewers
- Editor toolbar

### Phase 4: Advanced UI (M6-M7)

**Tasks:**

1. Search interface
2. Backlinks panel
3. Command palette
4. Export dialogs

**Deliverables:**

- Full-text search UI
- Backlinks visualization
- Command palette
- Export/import UX

---

## 8. Contributor Guidance

### Quick Reference Card

**Working in `/notes/**`:\*\*

```tsx
import { Button, Card } from "@/components/ds"; // Glass-UI

<Card surface="glass-1" padding="md">
  <Button intent="primary" surface="glass-1">
    Save Note
  </Button>
</Card>;
```

**Working outside `/notes/**`:\*\*

```tsx
import { Button } from "@/components/ui/button"; // shadcn

<Card className="bg-glass-1 backdrop-blur-md">
  <Button variant="default">Save</Button>
</Card>;
```

### Decision Tree for Contributors

```
Are you working in /notes/** ?
       ↓
    YES → Use Glass-UI/DiceUI
     |    Follow metaphor budget (0-2)
     |    Use DS facade
     |    Apply surface tokens
     ↓
    NO  → Use shadcn/Radix
          Apply same surface tokens via className
          Match motion rules
          Don't import Glass-UI
```

---

## 9. Documentation References

**Core Documentation:**

- This file: `LIQUID-GLASS-DESIGN-SYSTEM.md`
- Design tokens: `lib/design-system/README.md` (to be created)
- Component API: `components/ds/README.md` (to be created)
- Metaphor budget: `docs/DESIGN-PRINCIPLES.md` (to be created)

**Implementation Guides:**

- M3 UI Foundation: `11-implementation-guide.md` (to be updated)
- Component examples: `06-ui-components.md` (to be updated)
- Testing visual regressions: `12-testing-strategy.md` (to be updated)

**External References:**

- Glass-UI docs: https://glass-ui.com/docs
- DiceUI docs: https://dice-ui.com/docs
- shadcn/ui: https://ui.shadcn.com

---

## 10. Summary

**One App, Two Libraries, Unified Language:**

- `/notes/**`: Glass-UI + DiceUI (fluid, modern, IDE-like)
- Rest of app: shadcn/Radix (stable, familiar)
- Both: Share tokens, intents, surfaces, motion

**Key Success Factors:**

1. **Consistency**: Same visual language across routes
2. **Isolation**: Clear boundaries between component sources
3. **Pragmatism**: Facade layer unifies API
4. **Restraint**: Conservative motion, minimal metaphor
5. **Enforcement**: CI checks + code review

**Result:** Cohesive user experience with appropriate tools for each context.
