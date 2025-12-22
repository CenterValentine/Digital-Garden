# David's Digital Garden Design System

This directory contains reusable UI components built with Tailwind CSS following the **Intent-Role-State** pattern, styled with the Digital Garden color palette.

## Design Principles

### Intent-Role-State Pattern

Our components follow a three-dimensional variant system:

1. **Intent**: Semantic meaning (primary, secondary, danger, success, etc.)
   - Maps to semantic tokens
   - Communicates purpose, not appearance
   - Example: `variant="leaf"` for growth/success actions

2. **Role**: Component type (button, card, input, etc.)
   - Defines base styling and layout rules
   - Encodes accessibility and affordances
   - Example: `<Button>` vs `<Card>` vs `<TreeNode>`

3. **State**: Transient modifications (hover, focus, disabled, etc.)
   - Modifies intent or role
   - Non-optional for accessibility
   - Example: `state="active"` or `state="disabled"`

### Visual Language

Inspired by the Digital Garden logo - organic growth meets technology:

- **Shale Palette**: #3D5A5B (dark), #5A7A7A (mid), #7A9A9A (light) - Depth/connection
- **Gold Palette**: #C9A86C (primary), #8B7355 (dark), #E5D4B0 (light) - Knowledge/foundation
- **Leaf Palette**: #4CAF50 (primary), #81C784 (light), #A5D6A7 (bright) - Growth/success
- **Effects**: Neon glows, circuit patterns, organic branching
- **Aesthetics**: Circuit board roots + organic tree branches

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

### David's Digital Garden Color Palette

#### Shale (Depth/Connection)

- `shale-dark`: #3D5A5B - Primary backgrounds, deep surfaces
- `shale-mid`: #5A7A7A - Secondary backgrounds, overlays
- `shale-light`: #7A9A9A - Muted text, borders

#### Gold (Knowledge/Foundation)

- `gold-primary`: #C9A86C - Headlines, CTAs, primary actions
- `gold-dark`: #8B7355 - Hover states, secondary gold
- `gold-light`: #E5D4B0 - Highlights, selected states

#### Leaf (Growth/Success)

- `leaf-primary`: #4CAF50 - Success states, growth indicators
- `leaf-light`: #81C784 - Hover on success, light accents
- `leaf-bright`: #A5D6A7 - Highlights, new content badges

### Semantic Intent Tokens

- `intent-primary`: #4CAF50 (Leaf green - growth/success)
- `intent-secondary`: #C9A86C (Gold - knowledge/foundation)
- `intent-accent`: #5A7A7A (Shale - connection)
- `intent-danger`: #E57373 (Muted red)
- `intent-neutral`: #7A9A9A (Shale light)

### State Tokens

- `state-hover`: rgba(201, 168, 108, 0.15) - Gold hover
- `state-focus`: rgba(76, 175, 80, 0.2) - Leaf focus
- `state-active`: rgba(76, 175, 80, 0.3) - Leaf active
- `state-disabled`: rgba(122, 154, 154, 0.3) - Shale disabled

## Neon Glow Effects

Inspired by the circuit board aesthetic, we provide utility classes for neon glow effects:

```tsx
<div className="neon-glow-sm text-leaf-primary">Small glow (growth)</div>
<div className="neon-glow-md text-gold-primary">Medium glow (knowledge)</div>
<div className="neon-glow-lg text-shale-light">Large glow (connection)</div>
```

### Semantic Glow Shadows

```tsx
// Available as Tailwind shadow utilities
shadow - glow - leaf; // Green glow for growth/success states
shadow - glow - gold; // Gold glow for knowledge/hover states
shadow - glow - success; // Light green glow for success feedback
shadow - glow - warning; // Brown glow for warning states
```

---

## TreeNode Component

A specialized component for tree/branch navigation nodes.

### Usage

```tsx
import { TreeNode, BranchLine } from "@/components/ui/tree-node";

// Basic node
<TreeNode type="default" state="active" />

// Leaf node with glow
<TreeNode type="leaf" state="success" showGlow label="Ideas" />

// Branch lines
<BranchLine type="circuit" color="gold" withJunctions />
```

### Node Types

| Type       | Description                 |
| ---------- | --------------------------- |
| `default`  | Circular node               |
| `leaf`     | Diamond-shaped leaf node    |
| `junction` | Circular junction point     |
| `root`     | Rounded rectangle root node |
| `endpoint` | Small diamond endpoint      |

### Node States

| State      | Background   | Border       | Glow Color  |
| ---------- | ------------ | ------------ | ----------- |
| `default`  | shale-mid     | shale-light   | None        |
| `active`   | leaf-primary | leaf-light   | Green       |
| `hover`    | gold-primary | gold-light   | Gold        |
| `success`  | leaf-light   | leaf-bright  | Light green |
| `warning`  | gold-dark    | gold-primary | Brown       |
| `disabled` | shale-light   | shale-mid     | None        |

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
