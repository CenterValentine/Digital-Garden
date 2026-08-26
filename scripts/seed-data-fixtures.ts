/**
 * Seed the U1 reading-list fixture (plan B9).
 *
 *   pnpm tsx scripts/seed-data-fixtures.ts [ownerEmail]
 *
 * Use-case fixtures are not decoration. Smoke testing proves the grid
 * renders; it cannot tell you the configuration surface is right. "I need a
 * status that groups To-do / Doing / Done, not a flat select" is invisible
 * until someone builds a real table and tries to work in it — so U1 exists to
 * be *used*, not just to exist.
 *
 * Idempotent: re-running replaces the fixture rather than stacking copies.
 */

import "./_load-env";
import { prisma } from "../lib/database/client";
import type { Prisma } from "../lib/database/generated/prisma";
import {
  buildDefaultStatusOptions,
  deriveRowSearchText,
  deriveTableSearchText,
  generateColumnKey,
  keyAtEnd,
  keysBetween,
  type DataColumn,
  type DataColumnConfig,
  type RowData,
} from "../lib/domain/data";

const TABLE_TITLE = "Reading list";

interface SeedColumn {
  key: string;
  name: string;
  type: DataColumn["type"];
  isPrimary: boolean;
  description: string | null;
  config: DataColumnConfig;
}

async function main() {
  const email = process.argv[2];

  const owner = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!owner) {
    console.error(
      email
        ? `No user with email ${email}`
        : "No users in the database — sign in once first."
    );
    process.exit(1);
  }

  // Replace rather than duplicate, so this is safe to re-run while iterating.
  const existing = await prisma.contentNode.findFirst({
    where: { ownerId: owner.id, contentType: "data", title: TABLE_TITLE },
    select: { id: true },
  });
  if (existing) {
    await prisma.contentNode.delete({ where: { id: existing.id } });
    console.log("Removed the previous Reading list fixture.");
  }

  const statusOptions = buildDefaultStatusOptions().map((o, i) => ({
    ...o,
    label: ["Want to read", "Reading", "Finished"][i] ?? o.label,
  }));
  const [wantToRead, reading, finished] = statusOptions;

  const columns: SeedColumn[] = [
    {
      key: generateColumnKey(),
      name: "Title",
      type: "text",
      isPrimary: true,
      description: null,
      config: {},
    },
    {
      key: generateColumnKey(),
      name: "Author",
      type: "text",
      isPrimary: false,
      description: null,
      config: {},
    },
    {
      key: generateColumnKey(),
      name: "Status",
      type: "status",
      isPrimary: false,
      // A description written the way D9 intends: it tells a model something
      // the column NAME cannot.
      description:
        "Where it sits in the pipeline. Paused means started and set down, not abandoned.",
      config: { options: statusOptions },
    },
    {
      key: generateColumnKey(),
      name: "Rating",
      type: "number",
      isPrimary: false,
      description: "Out of 5. Only set once finished.",
      config: { precision: 0 },
    },
    {
      key: generateColumnKey(),
      name: "Finished",
      type: "date",
      isPrimary: false,
      description: "Only set when status is Finished. Left empty otherwise.",
      config: { includeTime: false },
    },
    {
      key: generateColumnKey(),
      name: "Source",
      type: "url",
      isPrimary: false,
      description: null,
      config: {},
    },
  ];

  const [title, author, status, rating, finishedOn, source] = columns;

  const books: RowData[] = [
    {
      [title.key]: "The Design of Everyday Things",
      [author.key]: "Don Norman",
      [status.key]: finished.id,
      [rating.key]: 5,
      [finishedOn.key]: "2026-01-14",
      [source.key]: "https://www.nngroup.com/books/design-everyday-things-revised/",
    },
    {
      [title.key]: "Thinking in Systems",
      [author.key]: "Donella Meadows",
      [status.key]: reading.id,
    },
    {
      [title.key]: "A Pattern Language",
      [author.key]: "Christopher Alexander",
      [status.key]: finished.id,
      [rating.key]: 5,
      [finishedOn.key]: "2025-11-02",
    },
    {
      [title.key]: "Data and Reality",
      [author.key]: "William Kent",
      [status.key]: finished.id,
      [rating.key]: 4,
      [finishedOn.key]: "2026-03-08",
      [source.key]: "https://archive.org/details/datareality0000kent",
    },
    {
      [title.key]: "The Timeless Way of Building",
      [author.key]: "Christopher Alexander",
      [status.key]: reading.id,
    },
    {
      [title.key]: "The Art of Doing Science and Engineering",
      [author.key]: "Richard Hamming",
      [status.key]: reading.id,
      [rating.key]: 4,
    },
    {
      [title.key]: "Seeing Like a State",
      [author.key]: "James C. Scott",
      [status.key]: wantToRead.id,
    },
  ];

  const columnPositions = keysBetween(null, null, columns.length);
  const rowKeys = keysBetween(null, null, books.length);

  const asDataColumns: DataColumn[] = columns.map((c, i) => ({
    id: "",
    key: c.key,
    name: c.name,
    type: c.type,
    position: columnPositions[i],
    isPrimary: c.isPrimary,
    config: c.config,
    description: c.description,
    deletedAt: null,
  }));

  const node = await prisma.contentNode.create({
    data: {
      ownerId: owner.id,
      title: TABLE_TITLE,
      slug: "reading-list",
      contentType: "data",
      dataPayload: {
        create: {
          mode: "inline",
          rowCount: books.length,
          description:
            "Books I am reading or mean to. Status drives the board; finished date is only set when status is Finished.",
          searchText: deriveTableSearchText(TABLE_TITLE, asDataColumns),
          columns: {
            create: columns.map((c, i) => ({
              key: c.key,
              name: c.name,
              type: c.type,
              position: columnPositions[i],
              isPrimary: c.isPrimary,
              config: c.config as unknown as Prisma.InputJsonValue,
              description: c.description,
            })),
          },
          views: {
            create: [
              {
                ownerId: owner.id,
                name: "All books",
                mode: "grid",
                access: "collaborative",
                filters: { op: "and", children: [] } as unknown as Prisma.InputJsonValue,
                sorts: [] as unknown as Prisma.InputJsonValue,
                columnPrefs: {} as unknown as Prisma.InputJsonValue,
                config: {} as unknown as Prisma.InputJsonValue,
                position: keyAtEnd(null),
              },
            ],
          },
          rows: {
            create: books.map((data, i) => ({
              sortKey: rowKeys[i],
              data: data as unknown as Prisma.InputJsonValue,
              searchText: deriveRowSearchText(asDataColumns, data),
              createdBy: owner.id,
            })),
          },
        },
      },
    },
    select: { id: true },
  });

  // The default view is set after creation because its id does not exist
  // until the nested create has run.
  const firstView = await prisma.dataView.findFirst({
    where: { tableId: node.id },
    select: { id: true },
  });
  if (firstView) {
    await prisma.dataPayload.update({
      where: { contentId: node.id },
      data: { defaultViewId: firstView.id },
    });
  }

  console.log(`Seeded "${TABLE_TITLE}" for ${owner.email}`);
  console.log(`  node:    ${node.id}`);
  console.log(`  columns: ${columns.length}`);
  console.log(`  rows:    ${books.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
