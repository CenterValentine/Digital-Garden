---
last_updated: 2026-08-26
audience: contributors and AI assistants
---

# Product Principles

Why features here are shaped the way they are. Architecture docs say *how* the
system is built; this says *what it is for*, so a design decision can be judged
before it is implemented.

Principles are added when a shipped feature clarifies one — each carries the
feature that made it legible.

---

## 1. Make the user's existing structure the path of least resistance

**Digital Garden's job is to lower the cost of acting inside the notes system
the user already has** — not to offer a faster surface beside it.

The failure this guards against: a user has a thought, and the quickest way to
capture or act on it is *outside* their organization — a scratch note, a
free-floating list, a custom container that duplicates a folder they already
maintain. Each of those is a small win now and a debt to the notes system
later. Structure erodes one convenient shortcut at a time.

So when a feature could either (a) let the user build a new parallel structure
or (b) make their existing files and folders directly actionable, prefer (b) —
even when (a) is more flexible. Flexibility that competes with the user's own
organization is a cost, not a feature.

**Worked example — Workbenches** (PR #177). A workspace with a view can turn
the folders under its view root into workspaces of their own: each folder
becomes a place to actually work, with its own tabs and layout, reachable in
one hover. Deliberately, **users cannot create custom workbenches** — folders
are the only vocabulary. That constraint is the point: it makes it hard *not*
to use the existing file/folder structure, and it gives instant access to
recurring work whose shape already matches a folder. Hiding and reordering
exist so the projection can be tuned, never so it can be invented.

**Design tests.** Before adding a way to organize something, ask:

- Does this duplicate a structure the user already maintains elsewhere? If so,
  can the feature *project* that structure instead of asking for it again?
- Does the fast path lead into the notes system, or around it? The convenient
  route and the structurally sound route should be the same route.
- Is the new vocabulary earned? A new kind of container needs to express
  something folders, tags, and content types genuinely cannot.
- When work recurs, does the feature get the user back to it in one action —
  or does it ask them to reconstruct the context each time?

Related: the extension gating ladder in `CLAUDE.md` ("Before Adding an
Extension Module") applies the same instinct one layer down — compose from what
exists before introducing a new layer.
