# Design System / Component Library Basics (React)

## Design Systems - Mapping user intent to UI components

A design system is a source of truth for how UI components should style and behave. This includes colors, fonts, spacing, and components (badges, buttons, cards, etc.).
A clean and ideal way to formulate a design system is to map user intent to UI components. Define the behavioral contract for components to clearly communicate the component's intent to the designer and developer.

For example, a button is a critical UI component that can encode the component's contract to communicate the component's intent to the user.

## Why map user intent to UI components?

By defining an intent="destructive" contract, the developer never has to decide which color to use for a delete button; the system does it for them, ensuring consistency across the entire application.

| **Component** | **Common Intents**                |
| ------------- | --------------------------------- |
| Button        | primary, secondary, danger, ghost |
| Alert         | info, success, warning, danger    |
| Badge         | info, success, warning            |
| Input         | default, error, disabled          |
| Toast         | success, error, info              |
| Tabs          | active, inactive                  |

## Styling system triad:

### 1. Intent

- Examples:
  - primary
  - secondary
  - danger
  - ghost
  - info
  - success
  - warning
  - disabled
  - active
  - inactive
  - default
  - error
  - warning
  - success
  - info
  - danger
  - link
- Maps to Semantic Tokens

### 2. Role

- Examples:

  - button
  - input
  - textarea
  - select
  - checkbox
  - radio
  - switch
  - dropdown

- Encodes layout rules, spacing, typography defaults, and more.
- Defines base UI component styling.
- Elevaation can be encoded in the role ( e.g. a card with a shadow)
- Accessibility and affordances.

### 3. State

- Examples:

  - hover
  - focus
  - active
  - disabled
  - checked
  - unchecked
  - selected
  - unselected
  - shadow
  - loading
  - success
  - error

- Modifies the intent or role.
- Elevation can be encoded in the state ( e.g. a button with a shadow on hover)
- It is transient.

### Common expert mistakes to avoid:

- Encoding intent into role (DangerButton)
- Encoding state into intent (error-primary).
- Using color names instead of intent.
- Letting states redefine layout instead of appearances.

### Exceptions:

- Icon-only buttons (e.g. <button><Icon name="delete" /></button>)
- Purely decorative components (e.g. <div class="decorative-thing">) // intent irrelevant
- One-off marketing pages (speed > system rigor).

## Going from CSS Chaos to Clarity (Declarative Configuration)

We need to move from writing a giant list of CSS classes to using a declarative configuration for our component.

### 1. Base Styles:

- What does every button share?

### 2. Default variants:

- common and safe combinations that a button assumes if there are no props.

### 3. Variant map:

A variant map maps props to styles.

| **Prop (intent)** | **Value (primary)** | **Styles**                                               |
| ----------------- | ------------------- | -------------------------------------------------------- |
| `intent`          | `primary`           | `background: $color-brand-600`, `color: $color-white`    |
| `intent`          | `secondary`         | `background: $color-gray-100`, `color: $color-gray-800`  |
| `size`            | `small`             | `padding: $space-2 $space-4`, `font-size: $font-size-sm` |
| `size`            | `large`             | `padding: $space-4 $space-8`, `font-size: $font-size-lg` |

#### a. The variant matrix:

| **Dimension** | **Values**                                     | **Product Need Encoded**                               |
| ------------- | ---------------------------------------------- | ------------------------------------------------------ |
| **Intent**    | `primary`, `secondary`, `destructive`, `ghost` | Hierarchy of actions, risk communication.              |
| **Size**      | `small`, `medium`, `large`                     | Density for tables/lists vs. prominence for marketing. |
| **State**     | `default`, `hover`, `disabled`                 | Interaction feedback and accessibility.                |

The total number of variants is the product of the values in each dimension (e.g., $4 \times 3 \times 3 = 36$ potential visual combinations).
This reduces complexity and guarantees consistency across the entire application!

#### b. Generalizing variant dimensions:

How the same dimensions apply to different component primitives, highlighting the similarities and differences in their manifestation:

| **Component** | **Dimension** | **Component-Specific Interpretation**                                    | **Typical Values**                         |
| ------------- | ------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| **`<Card>`**  | **Intent**    | **Type of content or status.** (Informs the user about the data inside.) | `default`, `highlight`, `warning`, `error` |
|               | **Size**      | **Information density/prominence.**                                      | `compact`, `standard`, `jumbo`             |
| **`<Badge>`** | **Intent**    | **Semantic status/meaning.** (Usually color-driven.)                     | `success`, `info`, `alert`, `neutral`      |
|               | **Size**      | **Fit within context** (e.g., inline text vs. header).                   | `small`, `medium`                          |
| **`<Input>`** | **State**     | **Field availability/validation status.**                                | `default`, `focused`, `error`, `disabled`  |
|               | **Size**      | **Standard form field scale.**                                           | `medium`, `large`                          |

#### c. Handling complexity inside a component:

As components grow in complexity, relying solely on variants becomes insufficient.
We need to use internal slots to handle the complexity inside a component.

### a. Internal slots:

- Example:

```tsx
<Button intent="primary">
  <Button.Icon slot="leading" size="small" /> // Slot 1: Leading icon Pay Now
  <Button.Spinner slot="trailing" /> // Slot 2: Trailing element
</Button>
```

Parent Component's Variant (Contract): A <Card intent="warning"> component ensures that the style of the warning state is inherited by its internal slots. The Card doesn't care what is in the header, but it forces the header's background, border, and text color to be warning-appropriate (e.g., yellow/orange tones). This ensures system consistency.

Slot Content's Responsibility (Composition): The Card.Header slot, now colored appropriately by the parent, is free to accept any custom content. You could place a custom icon or a bolded title inside it, and those elements are responsible for their specific sizing, margins, or state changes (like hover effects)

| **Element**                             | **Responsibility**                                                                               | **Example Action**                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Parent Variant** (`intent="warning"`) | Defines **semantic meaning** and applies **required foundational styles** to all internal parts. | Sets the `Card.Header` background color to `warning-light`. |
| **Internal Slot** (`Card.Header`)       | Defines **internal structure** and accepts **arbitrary content/overrides**.                      | Accepts a custom `<svg>` icon and manages its `small` size. |

## Glossary:

- **Component Library** - A component library is a collection of reusable components that can be used to create a consistent user experience.

- **Design System** - A design system is a collection of reusable components that can be used to create a consistent user experience.

- **Variant** - A variant is a variation of a component.

- **Variant System** - A variant system is a system that generates variants of a component.

  - **Tailwind CSS** - A variant system that generates variants of a component.
  - **Shadcn UI** - A variant system that generates variants of a component.
  - **CVA (Class Varient Authority)** - A variant system that generates variants of a component.
  - **Variant UI** - A variant system that generates variants of a component.

- **Base Class** - A base class is a class that is the base of a component.

- **Variant Type** - A variant type is a type of variant.

- **Variant Value** - A variant value is a value of a variant.

- **Default Variant** - A default variant is a variant that is the default variant of a component.

- **Component Variant** - A component variant is a variant of a component.

- **Variant Generator** - A variant generator is a generator that generates variants of a component.

- **Design/Core Token** - Raw values that can be used to style and behave a component such as colors, fonts, spacing, etc.

- **Semantic Tokens** - meaningful aliases that map to design tokens. They express intent and usage.

- **Utility-First CSS** - A CSS framework that uses utility classes to style and behave a component.

- **Component Library** - A component library is a collection of reusable components that can be used to create a consistent user experience.

- **Design System** - A design system is a collection of reusable components that can be used to create a consistent user experience.

- **Variant** - A variant is a variation of a component.

- **Affordance** - The ways in which a component is designed to be used so that its use is implied clearly to the user.

- **Skeuomorphism** - a design approach where digital interfaces intentionally mimic real-world objects.

- **generalizability** - A variant dimension that is not specific to a single component (applied across the entire component library).

- **Internal Slot** ("Slot") is an explicitly exposed, named region within a component's internal structure that is designed to accept custom content, styles, or even other components.

- **Declarative Engine** - The tool that merges the Base Styles with selected intent and size styles.

- **Variant Bloat** - Where a component's number of variants grows exponentially with the number of dimensions, leading to a combinatorial explosion of possible visual states.

- **Style collision** - Where two or more styles conflict with each other.

- **Compound Styles** - A variant override of a combination of multiple variants.

- **Component Recipes** - The collection of components that are used together to create a specific user experience.

- **Semantic Naming** - A naming convention for design tokens that is based on the semantic meaning of the token. Describe what the token is used for, not what it looks like.

-**Design Token Compiler/Token Transformer** - A tool that compiles the design tokens into a format that can be used by the component library. Example: Style Dictionary.

## Fun Glossary:

**mystery meat UI** - a design approach where the interface is intentionally confusing and difficult to use.

## Questions:

- how does defining a behavioral contract upfront help a developer more than simply having three separate classes like .blue-button, .red-button, and .gray-button?

# Appendix:

## WCAG afforance and contrast guidelines:

- Contrast is defined at the token level, not the component level.
- Affordance consideration:
  - Color usage rules where color cannot convey meaning by itself.
  - Focus visibility.
  - hover, active, disabled state clarity.
  - Size and spacing rules.
  - Consistent interaction patterns.
  - Treat visual cues (underline, border, shadow, ring) as functional signals
- Variant Governance (in mature CSS systems):

  - Variants are pre-validated for contrast
  - Intents are pre-validated for affordance
  - States are non-optional

- A button isn’t accessible because it’s blue. It’s accessible because:
- It looks clickable at rest
- It changes on hover/focus/active
- It signals disabled vs enabled
- It retains meaning without color
- accessibility is a system concern, not a styling concern.

### Where progressive design conflicts with WCAG:

- Progressive web design is a systems tradeoff that must be managed intentionally.
- Progressive aesthetics often remove redundancy. WCAG requires redundancy.
- Innovation assumes motor and sensory capability. WCAG assumes variance.
- WCAG assumes that users have the ability to perceive and understand the difference between states.
- Progressive design may assume that users have the ability to perceive and understand the difference between states.
- WCAG optimizes for learnability across contexts, not delight-in-discovery.
- Designers optimize for mood. WCAG optimizes for legibility under stress.
- Defaults are accessible.
- Key test: Can a user complete the primary task without the experimental layer?
- How to impliment succesfully:
  - Accessible core → Enhanced interaction → Optional delight (ie accessibility is not a fallback)
- WCAG perspectives:
  - Principle 1: Redundancy Is a Feature, Not a Bug
  - Principle 2: States are sacred.
  - Principle 3: Novel != non-standard semantics.
  - Principle 4: Progressive disclosure > hidden UI.

### Overcoming challenges of multiple design systems in a single codebase:

- Variant systems:

  - Tailwind CSS
  - Shadcn UI
  - CVA (Class Varient Authority)
    - Uses a single class to generate all variants.
    - Example:
      - <button class="btn btn-primary">Primary</button>
      - <button class="btn btn-secondary">Secondary</button>
      - <button class="btn btn-tertiary">Tertiary</button>
      - <button class="btn btn-quaternary">Quaternary</button>
      - <button class="btn btn-quinary">Quinary</button>
      - <button class="btn btn-senary">Senary</button>
      - <button class="btn btn-septenary">Septenary</button>
  - You conceptually define variant-aware class geneerators:
    - Base classes
    - Variant Types
    - Variant values -> class names
    - Default variants
    - component variants(optional)
  - Example:

    ```tsx
    const button = cva("btn", {
        variants: {
            variant: {
                primary: "btn-primary",
                secondary: "btn-secondary",
                tertiary: "btn-tertiary",
            },
        },
    });

    <button className={button({ variant: "primary" })}>Primary</button>
    <button className={button({ variant: "secondary" })}>Secondary</button>
    <button className={button({ variant: "tertiary" })}>Tertiary</button>
    ```

#### d. Variant generation:

##### 1. Recipe Architecture & Organization

- how to efficiently define base styles and slots:

```md
/Button
├── Button.tsx // The main React component
├── Button.recipe.ts // The Tailwind Variants (TV) definition
└── index.ts
```

- This dramatically reduces mental overhead. To change a button's style, they only need to open the /Button directory, not jump across the file system to a central styles folder.

- Button.recipe.ts contents:
  |**Section**|**Role**|**Example**|
  |---|---|---|
  |**Base Styles**|Styles applied to the element _before_ any variants are considered.|`inline-flex items-center rounded-md`|
  |**Slots**|Defines the named internal elements (e.g., the icon, the text wrapper) that need separate styling.|`slots: { root: '...', icon: '...' }`|
  |**Variants**|Maps the contract (`intent`, `size`) to specific style tokens for **each defined slot**.|`primary: { root: 'bg-blue-600', icon: 'text-white' }`|

##### 2. Design Token Naming Conventions:

- Exploring industry best practices for naming your styles (colors, spacing, typography) using Semantic Naming to ensure they are resilient to design changes.

Semantic Naming

##### 3. The Tooling Ecosystem:

Architectural flow:

1. Design Token JSON (where the value 1rem is stored)
2. Tailwind Config (tailwind.config.js) - where that value is registered as a utility class, e.g., p-input-md)
3. Component Recipe (Button.recipe.ts using Tailwind Variants)
4. React Component (The final rendered HTML/CSS).

- Looking at the specific tools and platforms (beyond just Tailwind Variants) needed for the full lifecycle: design, code implementation, and documentation/discovery.

- Component Libraries (e.g. Button, Card, Input, etc.)
- Design Patterns (e.g. Modal, Tooltip, Dropdown, etc.)
- Design Principles (e.g. Consistency, Accessibility, etc.)
- Design Goals (e.g. Performance, Usability, etc.)
- Design Constraints (e.g. Accessibility, Performance, etc.)
- Design Decisions (e.g. Consistency, Accessibility, etc.)
