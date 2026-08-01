/**
 * AI v3.2.2 prompt-cache contract checks.
 *
 * Run with: pnpm prompt-cache:check
 */

import assert from "node:assert/strict";
import {
  buildPromptCachePolicy,
  mergeAIProviderOptions,
  summarizePromptCacheUsage,
  supportsOpenAIPromptCaching,
} from "../lib/domain/ai/prompt-cache";
import { buildSystemPrompt } from "../lib/domain/ai/system-prompt";

const basePolicy = {
  providerId: "openai",
  modelId: "gpt-4o",
  userId: "user-123",
  toolNames: ["read_page", "search_web", "phase_checkpoint"],
  playbookId: "playbook-123",
  playbookContext: "Standing rules\nPhase A: Research the company",
} as const;

const firstRun = buildPromptCachePolicy(basePolicy);
const secondRun = buildPromptCachePolicy({
  ...basePolicy,
  // Provider key identity is deliberately insensitive to tool registration
  // order and does not receive conversation/run ids.
  toolNames: ["phase_checkpoint", "read_page", "search_web"],
});

assert.equal(firstRun.enabled, true);
assert.match(firstRun.cacheKey ?? "", /^dg-chat:[a-f0-9]{40}$/);
assert.equal(firstRun.cacheKey, secondRun.cacheKey);
assert.equal(
  firstRun.providerOptions?.openai?.promptCacheKey,
  firstRun.cacheKey,
);

const editedPlaybook = buildPromptCachePolicy({
  ...basePolicy,
  playbookContext: "Standing rules\nPhase A: Research, verify, and cite",
});
assert.notEqual(
  editedPlaybook.cacheKey,
  firstRun.cacheKey,
  "playbook edits must rotate the cross-run cache identity",
);

const nextPhase = buildPromptCachePolicy({
  ...basePolicy,
  playbookContext: "Standing rules\nPhase B: Draft the findings",
});
assert.notEqual(
  nextPhase.cacheKey,
  firstRun.cacheKey,
  "progressive-disclosure phases must not share a key",
);

const differentUser = buildPromptCachePolicy({
  ...basePolicy,
  userId: "user-456",
});
assert.notEqual(
  differentUser.cacheKey,
  firstRun.cacheKey,
  "BYOK/user cache scopes must stay isolated",
);

assert.equal(
  buildPromptCachePolicy({
    ...basePolicy,
    providerId: "anthropic",
    modelId: "claude-sonnet-4",
  }).enabled,
  false,
  "3.2.2 does not opt Anthropic into paid cache writes",
);
assert.equal(
  buildPromptCachePolicy({
    ...basePolicy,
    modelId: "gpt-4",
  }).enabled,
  false,
  "legacy GPT-4 must not receive an unsupported cache key",
);
assert.equal(supportsOpenAIPromptCaching("openai/gpt-5.6-terra"), true);
assert.equal(supportsOpenAIPromptCaching("o3-mini"), true);

const merged = mergeAIProviderOptions(
  {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 5_000 },
    },
  },
  firstRun.providerOptions,
);
assert.deepEqual(merged, {
  anthropic: {
    thinking: { type: "enabled", budgetTokens: 5_000 },
  },
  openai: {
    promptCacheKey: firstRun.cacheKey,
  },
});

assert.deepEqual(
  summarizePromptCacheUsage({
    inputTokens: 10_000,
    inputTokenDetails: {
      noCacheTokens: 2_000,
      cacheReadTokens: 7_000,
      cacheWriteTokens: 1_000,
    },
  }),
  {
    inputTokens: 10_000,
    noCacheTokens: 2_000,
    cacheReadTokens: 7_000,
    cacheWriteTokens: 1_000,
    hitRate: 0.7,
  },
);
assert.deepEqual(summarizePromptCacheUsage(undefined), {
  inputTokens: 0,
  noCacheTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  hitRate: 0,
});

const orderedPrompt = buildSystemPrompt({
  hasImageTools: false,
  hasFlashcardTools: false,
  hasWebSearch: false,
  hasCheckpointTool: false,
  hasBrowserReadTool: false,
  hasTabLauncher: false,
  hasResearchTools: false,
  runtimeProviderName: "OpenAI",
  runtimeModelId: "gpt-4o",
  openWorkflowTitle: undefined,
  editableContentId: undefined,
  isChatContent: false,
  chatContentId: undefined,
  autoPronounceDefault: false,
  playbookContext: "CACHEABLE_PLAYBOOK_PHASE",
  playbookAwareness: "",
  rootedContentSection: "RUN_SPECIFIC_ROOT",
  outputTargetSection: "RUN_SPECIFIC_OUTPUT_TARGET",
  userContextSection: "RUN_SPECIFIC_USER_CONTEXT",
  mentionedContext: "RUN_SPECIFIC_MENTION",
  checkpointIntegritySection: "",
  pageContextSection: "UNTRUSTED_PAGE_CONTEXT",
});

const position = (marker: string) => {
  const index = orderedPrompt.indexOf(marker);
  assert.notEqual(index, -1, `missing prompt marker: ${marker}`);
  return index;
};

assert.ok(
  position("CACHEABLE_PLAYBOOK_PHASE") < position("RUN_SPECIFIC_ROOT"),
);
assert.ok(
  position("CACHEABLE_PLAYBOOK_PHASE") <
    position("RUN_SPECIFIC_OUTPUT_TARGET"),
);
assert.ok(
  position("RUN_SPECIFIC_OUTPUT_TARGET") <
    position("RUN_SPECIFIC_USER_CONTEXT"),
);
assert.ok(
  position("RUN_SPECIFIC_USER_CONTEXT") < position("RUN_SPECIFIC_MENTION"),
);
assert.ok(
  position("RUN_SPECIFIC_MENTION") < position("UNTRUSTED_PAGE_CONTEXT"),
);

console.log("prompt-cache checks passed");
