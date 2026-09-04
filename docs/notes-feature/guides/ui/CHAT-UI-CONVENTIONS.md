# Chat UI conventions

Owner-set rules for the chat transcript surfaces (ChatPanel, full-page ChatViewer, extension panel embed). Established 2026-09-04 during the AI 3.8 control-panel pass; apply to every new chat-surface element.

## Status is text, boxes are content

**The rule:** a bordered/boxed container promises *content* — something that persists and is worth framing. A transient signal styled as content reads heavier than it is. This is also the platform idiom (claude.ai and ChatGPT both render thinking/working/searching states as quiet inline text with motion, and reserve frames for artifacts).

**Status layer — borderless, inline, muted, with motion as the liveness cue:**
- Reasoning/thinking disclosures (all four provider renderers): ghost chevron + icon + label + elapsed, expanded thought text indented beneath — no border, no background. Provider accent survives as text/icon color only.
- "Working…" (between-token proof-of-life): inline gray text + pulse icon + bouncing dots + the elapsed counter (the counter is load-bearing — a ticking number proves a minutes-long reasoning model is alive; a static spinner can't).
- "Thinking…" (tools executing): same, keeping its indigo tint so tool activity reads distinct.

**Content layer — framed:**
- Tool result bubbles, approval cards, proposal cards (generation, column options, flashcards), batch gallery cards, artifact/note cards. These persist and act; they get borders.

**Litmus test for a new element:** will this row still mean something when the turn is over? Yes → it may be a card. No (it describes what is happening *right now*) → borderless text.

## Related conventions (same pass)

- **One labeled home for chat calibrations:** the ChatControlPanel hosts target folder, target output, model lock, and context as single-line settings rows (label left, control right, hints behind tooltips). Rail and header stay minimal — no duplicated affordances.
- **Toolbar actions are icon-only** with the label as tooltip (Export, Export Chat).
- **Chip icons mirror state**, never decorate: the output-target chip shows the *selected* mode's icon (chat/under-content/folder), not a generic glyph.
- **Portaled floating layers, dismissed by DOM order:** menus/panels portal to `<body>`; click-away handlers exempt layers appended *after* themselves (portal append order is the z-stack's chronological record) rather than inspecting `position` styles, which false-positive on the app shell.
