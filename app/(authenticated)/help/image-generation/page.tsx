/**
 * Help: Enabling AI Image Generation (v1).
 *
 * A markdown help doc rendered through the existing TipTap publishing
 * renderer (markdownToTiptap → TipTapContent, same path/styles as published
 * pages). Intentionally simple — the content is an inline markdown string we
 * can later promote to a managed/published doc.
 */

import { TipTapContent } from "@/components/public/TipTapContent";
import { markdownToTiptap } from "@/lib/domain/content";

const HELP_MARKDOWN = `# Enabling AI image generation

Some features create images with an AI image provider — **identification flashcards** (cards with a generated image on the front) and the chat **Generate Image** tool. You need to connect an image provider before these work. There are two ways.

## Option 1 — Connect a provider in the app (recommended)

1. Open **Settings → AI → Connections**.
2. Choose **Add connection** and pick an image-capable provider (OpenAI, Google, fal.ai, Together, Fireworks, DeepAI, RunwayML, or Artbreeder). Paste that provider's API key.
3. Open **Settings → AI** and find the **Generate Image** tool.
4. Set its route: pick the connection you just added and an image model (for example \`dall-e-3\`, \`gpt-image-1\`, \`imagen-3\`, or a FLUX model).

Image generation now routes through that provider — for both the chat Generate Image tool and image flashcards.

## Option 2 — Set an environment variable (self-hosting / development)

If you run your own instance, set the provider's key in \`.env.local\` and restart the server:

- **OpenAI** (DALL·E 3, GPT Image 1): \`OPENAI_API_KEY\`
- **Google** (Imagen 3): \`GOOGLE_AI_API_KEY\`
- **fal.ai** (FLUX): \`FAL_API_KEY\`
- **Together**: \`TOGETHER_API_KEY\`
- **Fireworks**: \`FIREWORKS_API_KEY\`
- **DeepAI**: \`DEEPAI_API_KEY\`
- **RunwayML**: \`RUNWAY_API_KEY\`
- **Artbreeder**: \`ARTBREEDER_API_KEY\`

A configured Connection (Option 1) always takes priority over an environment variable.

## Troubleshooting

- **"No API key configured for image provider …"** — no provider is connected yet. Follow Option 1 or Option 2.
- **Image flashcards are limited to 5 per batch.** Each card runs a real image-generation call, so the cap keeps cost and wait time reasonable. Accept a batch, then ask for more.
`;

export default function ImageGenerationHelpPage() {
  const body = markdownToTiptap(HELP_MARKDOWN);
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <TipTapContent bodyJson={body} className="public-prose public-prose--lg" />
    </div>
  );
}
