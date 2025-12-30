# Animate UI Components

Animate UI components integrated and adapted for the Digital Garden design system.

## Source

All components are from [Animate UI](https://animate-ui.com/).

## Integration Notes

Animate UI components are Radix-based and integrate well with the existing design system. Components have been adapted to:

- Use Digital Garden color tokens
- Use design system spacing tokens
- Maintain Radix UI accessibility features
- Work with existing Tailwind configuration

## Components

### Backgrounds

- GravityStars - [Source](https://animate-ui.com/docs/components/backgrounds/gravity-stars)
- HoleBackground - [Source](https://animate-ui.com/docs/components/backgrounds/hole)
- FireworksBackground - [Source](https://animate-ui.com/docs/components/backgrounds/fireworks)

### Buttons

- FlipButton - [Source](https://animate-ui.com/docs/components/buttons/flip)
- LiquidButton - [Source](https://animate-ui.com/docs/components/buttons/liquid)
- RippleButton - [Source](https://animate-ui.com/docs/components/buttons/ripple)
- CopyButton - [Source](https://animate-ui.com/docs/components/buttons/copy)
- IconButton - [Source](https://animate-ui.com/docs/components/buttons/icon)

### Navigation

- Sidebar - [Source](https://animate-ui.com/docs/components/radix/sidebar)
- Sheet - [Source](https://animate-ui.com/docs/components/radix/sheet)
- Tabs - [Source](https://animate-ui.com/docs/components/radix/tabs)
- Progress - [Source](https://animate-ui.com/docs/components/radix/progress)

### Forms

- Checkbox - [Source](https://animate-ui.com/docs/components/radix/checkbox)
- RadioGroup - [Source](https://animate-ui.com/docs/components/radix/radio-group)
- Switch - [Source](https://animate-ui.com/docs/components/radix/switch)
- Toggle - [Source](https://animate-ui.com/docs/components/radix/toggle)
- ToggleGroup - [Source](https://animate-ui.com/docs/components/radix/toggle-group)

### Modals

- AlertDialog - [Source](https://animate-ui.com/docs/components/radix/alert-dialog)
- Dialog - [Source](https://animate-ui.com/docs/components/radix/dialog)
- Popover - [Source](https://animate-ui.com/docs/components/radix/popover)

### Data Display

- Table - [Source](https://animate-ui.com/docs/components/radix/table)
- Files - [Source](https://animate-ui.com/docs/components/radix/files)

### Interactive

- PreviewLinkCard - [Source](https://animate-ui.com/docs/components/radix/preview-link-card)
- HoverCard - [Source](https://animate-ui.com/docs/components/radix/hover-card)

## Usage

```tsx
import { FlipButton } from '@/components/third-party/animate-ui/FlipButton';
import { Sidebar } from '@/components/third-party/animate-ui/Sidebar';

<FlipButton color="shale" intent="primary">Click me</FlipButton>
<Sidebar color="gold" />
```

## Dependencies

- Radix UI primitives (already installed)
- `framer-motion` (already installed)
