// 1. Specify the source file(s) to read (your tokens/global.json).
// 2. Specify the destination directory for the generated output (let's use a new folder called dist/).
// 3. Define the platform configuration to generate CSS variables for Tailwind.

module.exports = {
  source: ["tokens/global.json", "tokens/theme-a.json", "tokens/theme-b.json"],
  platforms: {
    globalcss: {
      transformGroup: "css",
      buildPath: "dist/",
      include: ["tokens/global.json"],
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
      include: ["tokens/theme-a.json"],
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
      include: ["tokens/theme-b.json"],
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
