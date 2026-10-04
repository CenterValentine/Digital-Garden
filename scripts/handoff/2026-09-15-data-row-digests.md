# Handoff — AI row digests migration (2026-09-15)

`prisma/` is owner-owned, so this change ships as a patch you apply. It adds
one column and one table (AI-BULK-ROW-READING-PLAN §5.1):

- `DataPayload.rowDigests Boolean @default(false)` — per-table opt-in.
- `DataRowDigest` — 1:1 sidecar per row: `digest`, `sourceHash`, `dirty`,
  `model`, `generatedAt`, `updatedAt`; FK to `DataRow` with cascade; index on
  `dirty`.

Additive only: nothing existing changes shape, so the migration can deploy
AHEAD of the code (the code without the migration would fail on the first
digest read, so deploy the migration first).

The SQL was validated against local Postgres in a rolled-back transaction on
2026-09-15 (`BEGIN; …; ROLLBACK;` — every statement ran clean).

## Steps

```bash
git apply scripts/handoff/2026-09-15-data-row-digests.patch
git add prisma/schema.prisma prisma/migrations/20260915120000_data_row_digests
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm typecheck
```

`migrate deploy` above targets the local Docker database in `.env.local`.
For production, run the deploy with the production URL inline (never
`db push`, never a reset):

```bash
DATABASE_URL="<prod url>" pnpm exec prisma migrate deploy
```

Then commit the schema and the migration folder on this branch. The
`migration-drift` gate replays the history into a shadow DB and asserts it
reproduces `schema.prisma`; with both files committed together it passes.

## What the code expects once applied

- `prisma.dataRowDigest` (read side `lib/domain/data/server/digest-read.ts`,
  generation `lib/domain/data/server/digests.ts`).
- `DataPayload.rowDigests` (loader, `describe_database`, the schema rail
  switch, `PATCH /api/content/data/[id]` with `{ rowDigests }`).
- The `row-digest` feature route (Settings → AI → Routing); unconfigured, it
  falls back to the Studio Context model.
