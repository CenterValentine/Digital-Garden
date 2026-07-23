import assert from "node:assert/strict";
import {
  DEFAULT_OUTPUT_TARGET,
  outputTargetStorageKey,
  parseOutputTarget,
  renderOutputTargetInstruction,
  resolveOutputTargetKeyChange,
  type OutputTarget,
} from "../lib/domain/ai/output-target";

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

console.log("Output-target checks passed.");
