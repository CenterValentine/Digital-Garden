// 1. Specify the source file(s) to read (your tokens/global.json).
// 2. Specify the destination directory for the generated output (let's use a new folder called dist/).
// 3. Define the platform configuration to generate CSS variables for Tailwind.

module.exports = {
  source: [
    "lib/design-system/tokens/global.json",
    "lib/design-system/tokens/theme-a.json",
    "lib/design-system/tokens/theme-b.json",
  ],
  platforms: {
    globalcss: {
      transformGroup: "css",
      buildPath: "dist/",
      include: ["lib/design-system/tokens/global.json"],
      files: [
        {
          destination: "variables.css",
          format: "css/variables",
          options: {
            outputReferences: true,
            // Important: Define a selector for the CSS variables. The root selector makes them globally available.
            selector: ":root",
          },
        },
      ],
    },

    themeA: {
      transformGroup: "css",
      buildPath: "dist/",
      include: ["lib/design-system/tokens/theme-a.json"],
      files: [
        {
          destination: "theme-a.css",
          format: "css/variables",
          options: {
            outputReferences: true,
            selector: ".theme-a",
          },
        },
      ],
    },
    themeB: {
      transformGroup: "css",
      buildPath: "dist/",
      include: ["lib/design-system/tokens/theme-b.json"],
      files: [
        {
          destination: "theme-b.css",
          format: "css/variables",
          options: {
            outputReferences: true,
            selector: ".theme-b",
          },
        },
      ],
    },
  },
};
