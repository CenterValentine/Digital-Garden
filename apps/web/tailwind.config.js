module.exports = {
  theme: {
    extend: {
      fontWeight: {
        regular: "var(--font-weight-regular)",
        bold: "var(--font-weight-bold)",
      },
      colors: {
        brand: {
          primary: "var(--color-brand-primary)",
        },
        // Intent-based semantic tokens (from branch node colors)
        intent: {
          primary: "#10b981", // Green (from branch nodes)
          secondary: "#3b82f6", // Blue
          accent: "#f59e0b", // Amber
          warning: "#fb923c", // Orange
          danger: "#ef4444", // Red (for destructive actions)
          neutral: "#6b7280", // Gray
        },
        // Role-based tokens (surfaces, borders, etc.)
        surface: {
          default: "var(--background)",
          elevated: "#ffffff",
          overlay: "rgba(0, 0, 0, 0.5)",
        },
        // State-based tokens
        state: {
          hover: "rgba(16, 185, 129, 0.1)",
          focus: "rgba(59, 130, 246, 0.2)",
          active: "rgba(16, 185, 129, 0.2)",
          disabled: "rgba(107, 114, 128, 0.3)",
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
        glow: "0 0 4px currentColor, 0 0 8px currentColor, 0 0 12px currentColor",
        "glow-sm": "0 0 2px currentColor, 0 0 4px currentColor",
        "glow-md": "0 0 4px currentColor, 0 0 8px currentColor, 0 0 12px currentColor",
        "glow-lg": "0 0 8px currentColor, 0 0 16px currentColor, 0 0 24px currentColor",
      },
    },
  },
};
