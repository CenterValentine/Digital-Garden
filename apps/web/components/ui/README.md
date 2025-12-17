# Design System Component Library

This directory contains reusable UI components built with Tailwind CSS following the **Intent-Role-State** pattern from our design system theory.

## Design Principles

### Intent-Role-State Pattern

Our components follow a three-dimensional variant system:

1. **Intent**: Semantic meaning (primary, secondary, danger, success, etc.)

   - Maps to semantic tokens
   - Communicates purpose, not appearance
   - Example: `intent="primary"` instead of `color="green"`

2. **Role**: Component type (button, card, input, etc.)

   - Defines base styling and layout rules
   - Encodes accessibility and affordances
   - Example: `<Button>` vs `<Card>`

3. **State**: Transient modifications (hover, focus, disabled, etc.)
   - Modifies intent or role
   - Non-optional for accessibility
   - Example: `state="disabled"` or `state="loading"`

### Visual Language

Inspired by our branch node navigation system:

- **Colors**: Green (#10b981), Blue (#3b82f6), Amber (#f59e0b), Orange (#fb923c)
- **Effects**: Neon glows, subtle shadows, gradient backgrounds
- **Aesthetics**: Circuit/tech aesthetic, modern and clean

## Components

### Button

A versatile button component with multiple intents, sizes, and states.

#### Usage

```tsx
import { Button } from "@/components/ui/button";

// Basic usage
<Button>Click me</Button>

// With intent
<Button intent="primary">Primary Action</Button>
<Button intent="secondary">Secondary Action</Button>
<Button intent="danger">Delete</Button>
<Button intent="ghost">Cancel</Button>

// With size
<Button size="small">Small</Button>
<Button size="medium">Medium</Button>
<Button size="large">Large</Button>

// With state
<Button state="disabled">Disabled</Button>
<Button state="loading">Loading...</Button>
```

#### Variants

| Dimension  | Values                                              | Description                    |
| ---------- | --------------------------------------------------- | ------------------------------ |
| **intent** | `primary`, `secondary`, `accent`, `danger`, `ghost` | Semantic meaning of the action |
| **size**   | `small`, `medium`, `large`                          | Visual size and density        |
| **state**  | `default`, `disabled`, `loading`                    | Interaction state              |

#### Props

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "small" | "medium" | "large";
  state?: "default" | "disabled" | "loading";
}
```

---

### Card

A container component with internal slots for structured content.

#### Usage

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

<Card intent="default" size="standard">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content goes here.</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>

// With intent variants
<Card intent="highlight">Highlighted content</Card>
<Card intent="warning">Warning message</Card>
<Card intent="error">Error message</Card>

// With size variants
<Card size="compact">Compact card</Card>
<Card size="jumbo">Large card</Card>
```

#### Variants

| Dimension  | Values                                     | Description                    |
| ---------- | ------------------------------------------ | ------------------------------ |
| **intent** | `default`, `highlight`, `warning`, `error` | Type of content or status      |
| **size**   | `compact`, `standard`, `jumbo`             | Information density/prominence |

#### Internal Slots

- **CardHeader**: Container for title and description
- **CardTitle**: Main heading (h3)
- **CardDescription**: Supporting text
- **CardContent**: Main content area
- **CardFooter**: Action area at bottom

---

### Prose

A component for styling long-form content (articles, blog posts, documentation).

**Note**: For full typography features, install `@tailwindcss/typography` plugin. The component will work without it, but advanced prose styling may be limited.

#### Usage

```tsx
import { Prose } from "@/components/ui/prose";

<Prose intent="default">
  <h1>Article Title</h1>
  <p>Article content with proper typography...</p>
</Prose>

// Blog variant (larger text)
<Prose intent="blog">
  <h1>Blog Post</h1>
  <p>Blog content...</p>
</Prose>

// Compact variant (smaller text)
<Prose intent="compact">
  <h1>Documentation</h1>
  <p>Documentation content...</p>
</Prose>
```

#### Variants

| Dimension  | Values                       | Description                |
| ---------- | ---------------------------- | -------------------------- |
| **intent** | `default`, `blog`, `compact` | Content type and text size |

---

## Design Tokens

### Semantic Color Tokens

Colors are named by purpose, not appearance:

- `intent-primary`: #10b981 (Green)
- `intent-secondary`: #3b82f6 (Blue)
- `intent-accent`: #f59e0b (Amber)
- `intent-warning`: #fb923c (Orange)
- `intent-danger`: #ef4444 (Red)
- `intent-neutral`: #6b7280 (Gray)

### Surface Tokens

- `surface-default`: Background color
- `surface-elevated`: Elevated surfaces
- `surface-overlay`: Overlay backgrounds

### State Tokens

- `state-hover`: Hover state background
- `state-focus`: Focus ring color
- `state-active`: Active state background
- `state-disabled`: Disabled state opacity

## Neon Glow Effects

Inspired by branch node aesthetics, we provide utility classes for neon glow effects:

```tsx
<div className="neon-glow-sm text-intent-primary">Small glow</div>
<div className="neon-glow-md text-intent-secondary">Medium glow</div>
<div className="neon-glow-lg text-intent-accent">Large glow</div>
```

## Accessibility

All components follow WCAG guidelines:

- **Contrast**: Defined at token level, not component level
- **States**: Hover, focus, active, and disabled states are non-optional
- **Affordance**: Visual cues beyond color (shadows, borders, underlines)
- **Focus**: Visible focus indicators on all interactive elements
- **Semantics**: Proper HTML semantics and ARIA attributes

## Component Architecture

### Recipe Pattern

Each component follows the recipe architecture:

```
/component-name
├── Component.tsx      # React component
├── Component.recipe.ts # CVA variant definitions
└── index.ts           # Exports
```

### Base Styles

Base styles are applied before any variants are considered. They define:

- Layout rules
- Typography defaults
- Accessibility features
- Common transitions

### Variant System

Variants are defined using Class Variance Authority (CVA), which provides:

- Type-safe variant definitions
- Automatic class merging
- Default variant support
- Compound variant support

## Best Practices

1. **Use semantic tokens**: Always use `intent-primary` instead of `color-green-500`
2. **Don't encode intent into role**: Avoid `DangerButton`, use `<Button intent="danger">`
3. **Don't encode state into intent**: Avoid `error-primary`, use separate state prop
4. **Use internal slots**: For complex components, use slots (Card.Header, etc.)
5. **Maintain accessibility**: All interactive elements must have proper states

## Extending Components

To extend a component:

1. Add new variant values to the recipe file
2. Update TypeScript types in the component file
3. Document new variants in this README
4. Test accessibility and contrast ratios

## Examples

See component files for detailed implementation examples. Each component includes:

- TypeScript interfaces
- Variant definitions
- Usage examples in JSDoc comments
