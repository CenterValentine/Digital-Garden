# Aceternity UI Components

Aceternity UI components integrated and adapted for the Digital Garden design system.

## Source

All components are from [Aceternity UI](https://ui.aceternity.com/) and [Aceternity](https://www.aceternity.com/).

## Integration Notes

Components have been adapted to:

- Use Digital Garden color tokens (shale, gold, leaf, neon palettes)
- Use design system spacing tokens
- Maintain original animations and functionality
- Work with existing Tailwind configuration

## Components

### Backgrounds & Effects

1. **BackgroundRipple** - [Source](https://www.aceternity.com/components/background-ripple-effect)
2. **DottedGlowBackground** - [Source](https://www.aceternity.com/components/dotted-glow-background)
3. **BackgroundGradient** - [Source](https://ui.aceternity.com/components/background-gradient)
4. **GradientAnimations** - [Source](https://ui.aceternity.com/components/gradient-animations)
5. **WavyBackground** - [Source](https://ui.aceternity.com/components/wavy-background)
6. **BackgroundBoxes** - [Source](https://ui.aceternity.com/components/background-boxes)
7. **AuroraBackground** - [Source](https://ui.aceternity.com/components/aurora-background)
8. **NoiseBackground** ⭐⭐ - [Source](https://ui.aceternity.com/components/noise-background)
9. **GlowBorder** - [Source](https://www.aceternity.com/components/glow-border)
10. **Sparkles** - [Source](https://www.aceternity.com/components/sparkles)
11. **GlowingBorderEffect** ⭐ - [Source](https://ui.aceternity.com/components/glowing-effect)
12. **Vortex** ⭐ - [Source](https://ui.aceternity.com/components/vortex)
13. **LampEffect** ⭐⭐ - [Source](https://ui.aceternity.com/components/lamp-effect)

### Cards

1. **Card3D** - [Source](https://ui.aceternity.com/components/3d-card-effect)
2. **EvervaultCard** - [Source](https://ui.aceternity.com/components/evervault-card)
3. **WobbleCard** - [Source](https://ui.aceternity.com/components/wobble-card)
4. **ExpandableCard** - [Source](https://ui.aceternity.com/components/expandable-card)
5. **DraggableCard** - [Source](https://ui.aceternity.com/components/draggable-card)
6. **CardsSections** - [Source](https://ui.aceternity.com/components/cards)

### Buttons

1. **StatefulButtons** ⭐⭐ - [Source](https://ui.aceternity.com/components/stateful-buttons)
2. **MovingBorder** - [Source](https://ui.aceternity.com/components/moving-border)
3. **TailwindCSSButtons** - [Source](https://ui.aceternity.com/components/tailwindcss-buttons)

### Navigation

1. **Sidebar** - [Source](https://ui.aceternity.com/components/sidebar)
2. **FloatingDock** - [Source](https://ui.aceternity.com/components/floating-dock)
3. **AnimatedTabs** - [Source](https://ui.aceternity.com/components/tabs)
4. **StickyBanner** - [Source](https://ui.aceternity.com/components/sticky-banner)

### Forms

1. **PlaceholdersAndVanishInput** ⭐⭐⭐ - [Source](https://ui.aceternity.com/components/placeholders-and-vanish-input)
2. **SignupForm** - [Source](https://ui.aceternity.com/components/signup-form)

### Modals

1. **AnimatedModal** - [Source](https://ui.aceternity.com/components/animated-modal)

### Data Display

1. **Timeline** ⭐⭐⭐ - [Source](https://ui.aceternity.com/components/timeline)
2. **BentoGrid** ⭐ - [Source](https://ui.aceternity.com/components/bento-grid)
3. **Testimonials** - [Source](https://ui.aceternity.com/components/testimonials)

### Interactive

1. **StickyScrollReveal** - [Source](https://ui.aceternity.com/components/sticky-scroll-reveal)
2. **MacbookScroll** - [Source](https://ui.aceternity.com/components/macbook-scroll)
3. **HeroParallax** - [Source](https://ui.aceternity.com/components/hero-parallax)
4. **FollowingPointer** - [Source](https://ui.aceternity.com/components/following-pointer)
5. **PointerHighlight** - [Source](https://ui.aceternity.com/components/pointer-highlight)
6. **3DMarquee** ⭐⭐ - [Source](https://ui.aceternity.com/components/3d-marquee)
7. **GoogleGeminiEffect** ⭐ - [Source](https://ui.aceternity.com/components/google-gemini-effect)
8. **Compare** - [Source](https://ui.aceternity.com/components/compare)
9. **Lens** - [Source](https://ui.aceternity.com/components/lens)
10. **EncryptedText** ⭐⭐ - [Source](https://ui.aceternity.com/components/encrypted-text)
11. **LinkPreview** - [Source](https://ui.aceternity.com/components/link-preview)

### Layout

1. **AnimatedHeader** - [Source](https://ui.aceternity.com/components/animated-header)
2. **HeroSections** - [Source](https://ui.aceternity.com/components/hero-sections)
3. **FeatureSections** - [Source](https://ui.aceternity.com/components/feature-sections)

### Loading

1. **MultiStepLoader** - [Source](https://ui.aceternity.com/components/multi-step-loader)
2. **Loaders** - [Source](https://ui.aceternity.com/components/loader)

### Code

1. **CodeBlock** ⭐ - [Source](https://ui.aceternity.com/components/code-block)

## Usage

```tsx
import { BackgroundRipple } from '@/components/third-party/aceternity/BackgroundRipple';
import { Card3D } from '@/components/third-party/aceternity/Card3D';

// Use with Digital Garden colors
<BackgroundRipple color="shale" />
<Card3D intent="primary" />
```

## Adaptation Process

When integrating components:

1. Copy component code from Aceternity website
2. Replace hardcoded colors with `getColorVariable()` or CSS variables
3. Replace spacing values with `mapSpacing()` or design tokens
4. Update className to use Tailwind classes with design tokens
5. Add Digital Garden prop types from `@/lib/third-party/types`
6. Test with Digital Garden color palette

## Dependencies

- `framer-motion` - For animations
- `three`, `@react-three/fiber`, `@react-three/drei` - For 3D/shader components
