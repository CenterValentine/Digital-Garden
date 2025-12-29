# Third-Party Component Libraries

This directory contains third-party UI components integrated from various component libraries, adapted to work with the Digital Garden design system.

## Overview

Components are organized by source library, with each library in its own subdirectory. All components have been adapted to use Digital Garden design tokens (colors, spacing, typography) while preserving their original functionality and animations.

## Available Libraries

- **Aceternity UI** - Animated components, backgrounds, effects
- **Animate UI** - Radix-based animated components
- **Cult UI** - Unique aesthetic components
- **Glass UI** - Glass morphism effects
- **Dice UI** - Form and input components
- **Ali Imam** - Background effects and patterns
- **Creative Tim** - Admin/account components
- **Hexta UI** - Clerk integration components
- **ABUI** - Radio tabs, scroll progress
- **8Labs** - System banner, timeline
- **Ein Dev** - Stats widgets, glass timeline
- **Blocks.so** - Form layouts, tables, stats
- **FormCN** - Form templates
- **AI SDK** - AI/chatbot components
- **Billing SDK** - Pricing tables
- **Coss UI** - Toast, toolbar

## Design System Integration

All components have been adapted to use:

- **Colors**: Digital Garden palette (shale, gold, leaf, neon palettes)
- **Spacing**: Design system tokens (`size-xs`, `size-sm`, `size-md`, `size-lg`)
- **Typography**: Existing font system
- **Animations**: Consistent timing and easing via `tailwindcss-animate`

## Usage

Import components from their library-specific paths:

```tsx
// Aceternity UI components
import { BackgroundRipple } from "@/components/third-party/aceternity/BackgroundRipple";

// Animate UI components
import { FlipButton } from "@/components/third-party/animate-ui/FlipButton";

// Cult UI components
import { MinimalCard } from "@/components/third-party/cult-ui/MinimalCard";
```

## Component Adaptation

Components are adapted using utilities from `/lib/third-party/`:

- `getColorVariable()` - Maps Digital Garden colors to CSS variables
- `mapSpacing()` - Converts spacing values to design tokens
- `createAnimation()` - Consistent animation configurations
- Type definitions for consistent prop interfaces

## Documentation

Each library directory contains its own README with:

- Component list
- Usage examples
- Design system adaptations
- Known issues/limitations

## Notes

- Components are copy-pasted from original libraries and adapted
- Original functionality and animations are preserved
- Colors and spacing are mapped to Digital Garden tokens
- Some components may require additional dependencies (see individual library READMEs)
