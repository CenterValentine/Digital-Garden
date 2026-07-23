import assert from "node:assert/strict";
import {
  DEFAULT_OUTPUT_TARGET,
  outputTargetStorageKey,
  parseOutputTarget,
  renderOutputTargetInstruction,
  resolveOutputTargetKeyChange,
  type OutputTarget,
} from "../lib/domain/ai/output-target";
import { parseContentWriteReceipts } from "../lib/domain/ai/content-write-receipts";
import { resolveToolOutputPlacement } from "../lib/domain/ai/tools/output-placement";

const folderTarget: OutputTarget = {
  mode: "folder",
  folderId: "61cd8779-d213-440a-8788-97755f56530d",
  folderTitle: "AI Playbook Tests",
};

assert.deepEqual(parseOutputTarget(folderTarget), folderTarget);
assert.equal(parseOutputTarget({ mode: "folder" }), null);
assert.equal(parseOutputTarget({ mode: "unknown" }), null);

assert.deepEqual(
  resolveOutputTargetKeyChange({
    previousKey: "dg:output-target:conv:one",
    nextKey: "dg:output-target:conv:two",
    currentTarget: folderTarget,
    storedTarget: { mode: "besideContent" },
  }),
  { mode: "besideContent" },
  "switching conversations must hydrate the destination conversation",
);

assert.deepEqual(
  resolveOutputTargetKeyChange({
    previousKey: "dg:output-target:conv:one",
    nextKey: "dg:output-target:conv:two",
    currentTarget: folderTarget,
    storedTarget: null,
  }),
  DEFAULT_OUTPUT_TARGET,
  "an unsaved conversation must not inherit the previous chat's target",
);

assert.deepEqual(
  resolveOutputTargetKeyChange({
    previousKey: "dg:output-target:content:rooted-note",
    nextKey: "dg:output-target:conv:new-chat",
    currentTarget: folderTarget,
    storedTarget: folderTarget,
  }),
  folderTarget,
  "transient promotion must hydrate the selection written to its new key",
);

assert.deepEqual(
  resolveOutputTargetKeyChange({
    previousKey: "dg:output-target:content:rooted-note",
    nextKey: "dg:output-target:conv:new-chat",
    currentTarget: folderTarget,
    storedTarget: null,
  }),
  DEFAULT_OUTPUT_TARGET,
  "a content-to-conversation switch without a stored target must not be mistaken for promotion",
);

assert.equal(
  outputTargetStorageKey({ conversationId: "new-chat", contentId: "note" }),
  "dg:output-target:conv:new-chat",
);
assert.equal(
  outputTargetStorageKey({ conversationId: null, contentId: "note" }),
  "dg:output-target:content:note",
);

const instruction = renderOutputTargetInstruction(folderTarget);
assert.match(instruction, /AI Playbook Tests/);
assert.match(instruction, /omit parentId/);
assert.match(instruction, /explicitly names a different destination/);

assert.deepEqual(
  resolveToolOutputPlacement({
    targetFolderId: "research-folder",
    outputOwnerId: "chat-node",
  }),
  {
    parentId: "research-folder",
    role: "referenced",
    ownedByNoteId: "chat-node",
  },
  "under-chat output must be a referenced child of the chat",
);
assert.deepEqual(
  resolveToolOutputPlacement({
    targetFolderId: "research-folder",
    outputOwnerId: "chat-node",
    outputParentOverride: "selected-folder",
  }),
  { parentId: "selected-folder" },
  "a selected folder must override chat ownership",
);
assert.deepEqual(
  resolveToolOutputPlacement(
    {
      targetFolderId: "research-folder",
      outputOwnerId: "chat-node",
      outputParentOverride: "selected-folder",
    },
    "user-named-folder",
  ),
  { parentId: "user-named-folder" },
  "a destination explicitly named by the user must override the preset",
);

const writeReceipt = {
  operation: "updated",
  contentId: "90c01845-bdb9-40e8-8ffc-410f4044b900",
  title: "Run Ledger",
  contentType: "note",
  noun: "run ledger",
  location: {
    kind: "reference",
    contentId: "5a9e2278-8a2b-49c0-922e-39932314cbcc",
    title: "Clipboard Health research",
  },
} as const;

assert.deepEqual(
  parseContentWriteReceipts(
    JSON.stringify({ __checkpoint: true, __contentWrites: [writeReceipt] }),
  ),
  [writeReceipt],
  "JSON tool results must expose their persisted content destinations",
);
assert.deepEqual(
  parseContentWriteReceipts({ __contentWrites: [writeReceipt] }),
  [writeReceipt],
  "object tool results must expose their persisted content destinations",
);
assert.deepEqual(
  parseContentWriteReceipts({
    __contentWrites: [{ ...writeReceipt, contentId: null }],
  }),
  [],
  "malformed write receipts must never render as actionable content",
);

console.log("Output-target checks passed.");
