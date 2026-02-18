export interface ExampleMetadata {
  slug: string;
  name: string;
  description: string;
  docUrl: string;
}

export const EXAMPLES: ExampleMetadata[] = [
  {
    slug: "default-text-editor",
    name: "Default text editor",
    description: "Basic editor with StarterKit",
    docUrl: "https://tiptap.dev/docs/examples/basics/default-text-editor",
  },
  {
    slug: "formatting",
    name: "Formatting",
    description: "Text formatting tools",
    docUrl: "https://tiptap.dev/docs/examples/basics/formatting",
  },
  {
    slug: "images",
    name: "Images",
    description: "Image insertion and editing",
    docUrl: "https://tiptap.dev/docs/examples/basics/images",
  },
  {
    slug: "long-texts",
    name: "Long texts",
    description: "Performance with large documents",
    docUrl: "https://tiptap.dev/docs/examples/basics/long-texts",
  },
  {
    slug: "markdown-shortcuts",
    name: "Markdown shortcuts",
    description: "Type markdown syntax for instant formatting",
    docUrl: "https://tiptap.dev/docs/examples/basics/markdown-shortcuts",
  },
  {
    slug: "minimal-setup",
    name: "Minimal setup",
    description: "Bare minimum editor configuration",
    docUrl: "https://tiptap.dev/docs/examples/basics/minimal-setup",
  },
  {
    slug: "tables",
    name: "Tables",
    description: "Create and edit tables",
    docUrl: "https://tiptap.dev/docs/examples/basics/tables",
  },
  {
    slug: "tasks",
    name: "Tasks",
    description: "Task lists with checkboxes",
    docUrl: "https://tiptap.dev/docs/examples/basics/tasks",
  },
  {
    slug: "text-direction",
    name: "Text direction",
    description: "Right-to-left text support",
    docUrl: "https://tiptap.dev/docs/examples/basics/text-direction",
  },
];
