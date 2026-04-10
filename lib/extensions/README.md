# Built-In Extensions

Built-in extensions are first-party feature modules with clear ownership boundaries.

## Registration Protocol
- Create `extensions/<name>/`
- Add the extension manifest, runtime, and server runtime in that folder
- Register the extension once in `lib/extensions/installed.ts`
- If the extension should be user-toggleable, set `canDisable: true` in the manifest
- If the extension needs top-level shell UI, contribute it through the runtime shell slots instead of importing the feature directly into shared shell code
- If the extension owns a content-specific workspace, contribute it through the runtime content viewer hook instead of hardcoding it in `MainPanelContent`

## Expected Structure
- `manifest.ts`: metadata, nav items, settings metadata, auth metadata
- `client.tsx`: client runtime contributions such as surfaces, shell controls, dialogs, slash commands, editor blocks
- `client.tsx` may also declare a content viewer matcher when the extension owns rendering for a specific content selection
- `server-runtime.ts`: server-safe editor/runtime contributions
- `components/`: UI owned by the extension
- `server/`: services, types, parsers, and thin route handlers owned by the extension
- `state/`: extension-local stores

## Activation Rules
- Runtime enablement is client-persisted and layered on top of `enabledByDefault`
- Disabled extensions must disappear through the registry filters, not through direct feature conditionals in shared UI
- If an extension is disabled, its shell controls, dialogs, settings dialog, and runtime hooks should not mount

## Compatibility Rule
Legacy paths outside `extensions/<name>` may remain temporarily, but they should only re-export extension-owned code. New logic should be added inside the extension folder.
