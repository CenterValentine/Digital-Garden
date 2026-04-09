# Built-In Extensions

Built-in extensions are first-party feature modules with clear ownership boundaries.

## Registration Protocol
- Create `extensions/<name>/`
- Add the extension manifest, runtime, and server runtime in that folder
- Register the extension once in `lib/extensions/installed.ts`

## Expected Structure
- `manifest.ts`: metadata, nav items, settings metadata, auth metadata
- `client.tsx`: client runtime contributions such as surfaces, dialogs, slash commands, editor blocks
- `server-runtime.ts`: server-safe editor/runtime contributions
- `components/`: UI owned by the extension
- `server/`: services, types, parsers, and thin route handlers owned by the extension
- `state/`: extension-local stores

## Compatibility Rule
Legacy paths outside `extensions/<name>` may remain temporarily, but they should only re-export extension-owned code. New logic should be added inside the extension folder.
