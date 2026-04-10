import type { JSONContent } from "@tiptap/core";

import { prisma } from "@/lib/database/client";

interface ExtractedPersonMention {
  personId: string;
  positions: Array<{
    offset: number;
    context: string;
  }>;
}

export function extractPersonMentions(tiptapJson: JSONContent): ExtractedPersonMention[] {
  const mentions = new Map<string, ExtractedPersonMention>();
  let position = 0;

  function addMention(personId: string, label: string | null | undefined) {
    const existing = mentions.get(personId);
    const nextPosition = {
      offset: position,
      context: label?.trim() || "@person",
    };

    if (existing) {
      existing.positions.push(nextPosition);
      return;
    }

    mentions.set(personId, {
      personId,
      positions: [nextPosition],
    });
  }

  function walk(node: JSONContent, inCodeBlock = false, inHeading = false) {
    if (node.type === "codeBlock") {
      return;
    }

    if (node.type === "heading") {
      inHeading = true;
    }

    if (node.type === "personMention" && node.attrs?.personId) {
      addMention(String(node.attrs.personId), node.attrs.label ? String(node.attrs.label) : null);
      position += String(node.attrs.label || "@person").length;
      return;
    }

    const hasCodeMark = node.marks?.some((mark) => mark.type === "code") || false;

    if (node.type === "text" && node.text) {
      if (!inCodeBlock && !inHeading && !hasCodeMark) {
        position += node.text.length;
      } else {
        position += node.text.length;
      }
    }

    if (node.content) {
      for (const child of node.content) {
        walk(child, inCodeBlock, inHeading);
      }
    }
  }

  walk(tiptapJson);
  return Array.from(mentions.values());
}

export async function syncPersonMentions(
  contentId: string,
  tiptapJson: JSONContent,
  userId: string
): Promise<void> {
  try {
    const extracted = extractPersonMentions(tiptapJson);
    const extractedIds = new Set(extracted.map((mention) => mention.personId));

    const validPeople = extractedIds.size > 0
      ? await prisma.person.findMany({
          where: {
            id: { in: Array.from(extractedIds) },
            ownerId: userId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        })
      : [];

    const validIds = new Set(validPeople.map((person) => person.id));
    const validMentions = extracted.filter((mention) => validIds.has(mention.personId));

    const existingMentions = await prisma.personMention.findMany({
      where: {
        contentId,
      },
    });

    const validMentionIds = new Set(validMentions.map((mention) => mention.personId));
    const toRemove = existingMentions.filter((mention) => !validMentionIds.has(mention.personId));

    if (toRemove.length > 0) {
      await prisma.personMention.deleteMany({
        where: {
          id: {
            in: toRemove.map((mention) => mention.id),
          },
        },
      });
    }

    for (const mention of validMentions) {
      const existing = existingMentions.find((entry) => entry.personId === mention.personId);

      if (existing) {
        await prisma.personMention.update({
          where: {
            id: existing.id,
          },
          data: {
            positions: mention.positions as never,
          },
        });
        continue;
      }

      await prisma.personMention.create({
        data: {
          ownerId: userId,
          contentId,
          personId: mention.personId,
          positions: mention.positions as never,
        },
      });
    }
  } catch (error) {
    console.error("[syncPersonMentions] Error:", error);
  }
}
