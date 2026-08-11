<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Regenerate: pnpm ai:matrix
     CI guard:   pnpm ai:matrix:check (ai-drift.yml)
     Source:     scripts/generate-ai-capability-matrix.ts -->

# AI Capability Matrix

What each provider and model actually gets at runtime — derived from the code that decides it (`PROVIDER_CATALOG`, `CONNECTION_TEMPLATES`, `resolveModelTemperature`, `supportsOpenAIPromptCaching`, and the chat route's vendor sets), never hand-maintained. The narrative companion is [AI-ARCHITECTURE.md](AI-ARCHITECTURE.md).

## Provider behavior

| Provider | web_search | PDF attachments | Reasoning config (route) | App-managed prompt cache | Adapter branch |
|---|---|---|---|---|---|
| anthropic | provider-native | native ingestion | enabled-mode models get thinking config | none | yes |
| openai | provider-native | text extraction | none needed (auto-emits) | per-model (`supportsOpenAIPromptCaching`) | yes |
| google | provider-native | native ingestion | enabled-mode models get thinking config | none | yes |
| xai | provider-native | text extraction | — | none | yes |
| mistral | app fallback (needs Tavily/Brave connection, else NO search) | text extraction | — | none | yes |
| deepseek | app fallback (needs Tavily/Brave connection, else NO search) | text extraction | adaptive thinking; low effort in mechanical runs | none (provider caches automatically server-side) | yes |
| groq | app fallback (needs Tavily/Brave connection, else NO search) | text extraction | — | none | yes |

## Catalog models

`Max output` is load-bearing: it is the default output ceiling the chat route sends when the user has no explicit cap. `Reasoning` models get a 16k+ floor (drift gate 2) because thinking bills against the output budget.

### Anthropic (`anthropic`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `claude-sonnet-4` | 200,000 | 64,000 | text, vision, tools, streaming | medium | enabled (budget 5,000) | user setting | — |
| `claude-sonnet-3-5` | 200,000 | 8,192 | text, vision, tools, streaming | medium | — | user setting | — |
| `claude-opus-4` | 200,000 | 32,000 | text, vision, tools, streaming | high | — | user setting | — |
| `claude-haiku-4-5` | 200,000 | 64,000 | text, vision, tools, streaming | low | — | user setting | — |
| `claude-haiku-3-5` | 200,000 | 8,192 | text, tools, streaming | low | — | user setting | — |

### OpenAI (`openai`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `gpt-4o` | 128,000 | 16,384 | text, vision, tools, streaming | medium | — | user setting | yes |
| `gpt-4o-mini` | 128,000 | 16,384 | text, vision, tools, streaming | low | — | user setting | yes |
| `gpt-4` | 8,192 | 8,192 | text, tools, streaming | high | — | user setting | — |
| `o3-mini` | 200,000 | 100,000 | text, tools, streaming | medium | auto | fixed at 1 | yes |

### Google (`google`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `gemini-2.5-pro` | 1,000,000 | 65,536 | text, vision, tools, streaming | high | enabled | user setting | — |
| `gemini-2.0-flash` | 1,000,000 | 8,192 | text, vision, tools, streaming | low | — | user setting | — |

### xAI (`xai`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `grok-3` | 131,072 | 16,384 | text, tools, streaming | high | — | user setting | — |
| `grok-3-mini` | 131,072 | 16,384 | text, tools, streaming | medium | — | user setting | — |

### Mistral (`mistral`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `mistral-large` | 128,000 | 8,192 | text, vision, tools, streaming | medium | — | user setting | — |
| `codestral` | 32,000 | 8,192 | text, tools, streaming | medium | — | user setting | — |
| `mistral-large-latest` | 128,000 | 8,192 | text, vision, tools, streaming | medium | — | user setting | — |
| `codestral-latest` | 32,000 | 8,192 | text, tools, streaming | medium | — | user setting | — |

### DeepSeek (`deepseek`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `deepseek-v4-pro` | 128,000 | 65,536 | text, tools, streaming | medium | auto | user setting | — |
| `deepseek-v4-flash` | 128,000 | 65,536 | text, tools, streaming | low | auto | user setting | — |

### Groq (`groq`)

| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |
|---|---|---|---|---|---|---|---|
| `mixtral-8x7b` | 32,768 | 4,096 | text, tools, streaming | low | — | user setting | — |
| `llama-3.3-70b` | 128,000 | 8,192 | text, tools, streaming | low | — | user setting | — |
| `mixtral-8x7b-32768` | 32,768 | 4,096 | text, tools, streaming | low | — | user setting | — |
| `llama-3.3-70b-versatile` | 128,000 | 8,192 | text, tools, streaming | low | — | user setting | — |

## Connection templates

| Preset | Kind | Adapter | Seeded models | Model fetch |
|---|---|---|---|---|
| anthropic | direct | anthropic | 5 | yes |
| openai | direct | openai | 3 | yes |
| google | direct | google | 2 | yes |
| xai | direct | xai | 2 | yes |
| mistral | direct | mistral | 2 | yes |
| groq | direct | groq | 2 | yes |
| deepseek | direct | deepseek | 2 | yes |
| moonshot | direct | openai-compat | 0 | yes |
| vercel-gateway | gateway | vercel-gateway | 13 | yes |
| fireworks | gateway | openai-compat | 2 | yes |
| together | gateway | openai-compat | 2 | yes |
| openrouter | gateway | openai-compat | 9 | yes |

## Aggregator model ids → output-ceiling resolution

Namespaced ids (`vendor/model`) are looked up in the catalog by their bare id (everything after the first `/`). A hit inherits that entry's output ceiling and reasoning posture; a miss falls through to the provider's own default output cap (documented fallthrough — the model still works, uncapped by us).

| Template | Model id | Catalog resolution |
|---|---|---|
| vercel-gateway | `anthropic/claude-sonnet-4` | `anthropic/claude-sonnet-4` (max output 64,000) |
| vercel-gateway | `anthropic/claude-opus-4` | `anthropic/claude-opus-4` (max output 32,000) |
| vercel-gateway | `anthropic/claude-haiku-3-5` | `anthropic/claude-haiku-3-5` (max output 8,192) |
| vercel-gateway | `openai/gpt-4o` | `openai/gpt-4o` (max output 16,384) |
| vercel-gateway | `openai/gpt-4o-mini` | `openai/gpt-4o-mini` (max output 16,384) |
| vercel-gateway | `google/gemini-2.5-pro` | `google/gemini-2.5-pro` (max output 65,536) |
| vercel-gateway | `google/gemini-2.5-flash` | none — provider default cap |
| vercel-gateway | `openai/o3-mini` | `openai/o3-mini` (max output 100,000) |
| vercel-gateway | `openai/o1-mini` | none — provider default cap |
| vercel-gateway | `xai/grok-3` | `xai/grok-3` (max output 16,384) |
| vercel-gateway | `xai/grok-3-mini` | `xai/grok-3-mini` (max output 16,384) |
| vercel-gateway | `mistral/mistral-large-latest` | `mistral/mistral-large-latest` (max output 8,192) |
| vercel-gateway | `groq/llama-3.3-70b-versatile` | `groq/llama-3.3-70b-versatile` (max output 8,192) |
| fireworks | `accounts/fireworks/models/llama-v3p1-70b-instruct` | none — provider default cap |
| fireworks | `accounts/fireworks/models/mixtral-8x22b-instruct` | none — provider default cap |
| together | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | none — provider default cap |
| together | `Qwen/Qwen2.5-72B-Instruct-Turbo` | none — provider default cap |
| openrouter | `anthropic/claude-sonnet-4` | `anthropic/claude-sonnet-4` (max output 64,000) |
| openrouter | `anthropic/claude-3.5-sonnet` | none — provider default cap |
| openrouter | `openai/gpt-4o` | `openai/gpt-4o` (max output 16,384) |
| openrouter | `openai/gpt-4o-mini` | `openai/gpt-4o-mini` (max output 16,384) |
| openrouter | `google/gemini-2.5-pro` | `google/gemini-2.5-pro` (max output 65,536) |
| openrouter | `openai/o3-mini` | `openai/o3-mini` (max output 100,000) |
| openrouter | `x-ai/grok-3` | `xai/grok-3` (max output 16,384) |
| openrouter | `mistralai/mistral-large` | `mistral/mistral-large` (max output 8,192) |
| openrouter | `meta-llama/llama-3.3-70b-instruct` | none — provider default cap |

---

*Regenerated by `pnpm ai:matrix`; `pnpm ai:drift:check` guards the underlying tables against drifting from each other, and `pnpm ai:matrix:check` guards this doc against drifting from the tables.*
