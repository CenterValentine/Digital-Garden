module.exports = {
  theme: {
    extend: {
      fontWeight: {
        regular: "var(--font-weight-regular)",
        medium: "var(--font-weight-medium)",
        bold: "var(--font-weight-bold)",
      },
      colors: {
        brand: {
          primary: "var(--color-brand-primary)",
        },
        // David's Digital Garden Color Palette (using CSS variables)
        shale: {
          dark: "var(--shale-dark)",
          mid: "var(--shale-mid)",
          light: "var(--shale-light)",
        },
        gold: {
          primary: "var(--gold-primary)",
          dark: "var(--gold-dark)",
          light: "var(--gold-light)",
        },
        leaf: {
          primary: "var(--leaf-primary)",
          light: "var(--leaf-light)",
          bright: "var(--leaf-bright)",
        },
        // Intent-based semantic tokens (from Digital Garden palette)
        intent: {
          primary: "var(--intent-primary)",
          secondary: "var(--intent-secondary)",
          accent: "var(--intent-accent)",
          warning: "var(--gold-dark)",
          danger: "var(--intent-danger)",
          neutral: "var(--intent-neutral)",
        },
        // Role-based tokens (surfaces, borders, etc.)
        surface: {
          default: "var(--background)",
          elevated: "var(--card)",
          overlay: "rgba(61, 90, 91, 0.8)",
        },
        // State-based tokens
        state: {
          hover: "rgba(201, 168, 108, 0.15)", // Gold hover
          focus: "rgba(73, 166, 87, 0.2)", // Leaf focus
          active: "rgba(73, 166, 87, 0.3)", // Leaf active
          disabled: "rgba(110, 134, 157, 0.3)", // Slate disabled
        },
        // Neon Palettes
        neonBlue: {
          primary: "var(--neon-blue-primary)",
          secondary: "var(--neon-blue-secondary)",
          accent: "var(--neon-blue-accent)",
          dark: "var(--neon-blue-dark)",
          light: "var(--neon-blue-light)",
        },
        neonGold: {
          primary: "var(--neon-gold-primary)",
          secondary: "var(--neon-gold-secondary)",
          accent: "var(--neon-gold-accent)",
          dark: "var(--neon-gold-dark)",
          light: "var(--neon-gold-light)",
        },
        neonGreen: {
          primary: "var(--neon-green-primary)",
          secondary: "var(--neon-green-secondary)",
          accent: "var(--neon-green-accent)",
          dark: "var(--neon-green-dark)",
          light: "var(--neon-green-light)",
        },
      },
      spacing: {
        "size-xs": "var(--spacing-size-xs)",
        "size-sm": "var(--spacing-size-sm)",
        "size-md": "var(--spacing-size-md)",
        "size-lg": "var(--spacing-size-lg)",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.875rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
      },
      boxShadow: {
        // Neon glow effects for tree nodes
        "glow-leaf": "0 0 20px rgba(76, 175, 80, 0.6)",
        "glow-gold": "0 0 15px rgba(201, 168, 108, 0.4)",
        "glow-success": "0 0 25px rgba(129, 199, 132, 0.5)",
        "glow-warning": "0 0 12px rgba(139, 115, 85, 0.4)",
        // Generic glow utilities
        glow: "0 0 4px currentColor, 0 0 8px currentColor, 0 0 12px currentColor",
        "glow-sm": "0 0 2px currentColor, 0 0 4px currentColor",
        "glow-md":
          "0 0 4px currentColor, 0 0 8px currentColor, 0 0 12px currentColor",
        "glow-lg":
          "0 0 8px currentColor, 0 0 16px currentColor, 0 0 24px currentColor",
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
    },
  },
};
