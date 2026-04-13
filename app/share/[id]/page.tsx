import type { JSONContent } from "@tiptap/core";
import { notFound } from "next/navigation";

import { SharedContentViewer } from "@/components/share/SharedContentViewer";
import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { CONTENT_WITH_PAYLOADS } from "@/lib/domain/content";
import { getSession } from "@/lib/infrastructure/auth/session";

type SharePageParams = Promise<{ id: string }>;

async function getSignedInAccess(contentId: string) {
  const session = await getSession();
  if (!session) return null;

  try {
    return await resolveContentAccess(prisma, {
      contentId,
      userId: session.user.id,
      require: "view",
    });
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: SharePageParams }) {
  const { id } = await params;
  const [content, signedInAccess] = await Promise.all([
    prisma.contentNode.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: CONTENT_WITH_PAYLOADS,
    }),
    getSignedInAccess(id),
  ]);

  if (!content) {
    notFound();
  }

  const isPublic = content.isPublished;
  const canView = isPublic || Boolean(signedInAccess?.canView);

  if (!canView) {
    notFound();
  }

  const accessLevel =
    signedInAccess?.accessLevel === "owner" ||
    signedInAccess?.accessLevel === "edit" ||
    signedInAccess?.accessLevel === "view"
      ? signedInAccess.accessLevel
      : "public";

  return (
    <SharedContentViewer
      content={{
        id: content.id,
        title: content.title,
        contentType: content.contentType,
        isPublished: content.isPublished,
        accessLevel,
        canEdit: Boolean(signedInAccess?.canEdit),
        note: content.notePayload
          ? {
              tiptapJson: content.notePayload.tiptapJson as JSONContent,
            }
          : null,
        code: content.codePayload
          ? {
              code: content.codePayload.code,
              language: content.codePayload.language,
            }
          : null,
        html: content.htmlPayload
          ? {
              html: content.htmlPayload.html,
            }
          : null,
        external: content.externalPayload
          ? {
              url: content.externalPayload.url,
              subtype: content.externalPayload.subtype,
              preview: content.externalPayload.preview as Record<string, unknown>,
            }
          : null,
        file: content.filePayload
          ? {
              fileName: content.filePayload.fileName,
              mimeType: content.filePayload.mimeType,
              fileSize: content.filePayload.fileSize.toString(),
              uploadStatus: content.filePayload.uploadStatus,
            }
          : null,
        data: content.dataPayload
          ? {
              mode: content.dataPayload.mode,
              source: content.dataPayload.source,
              schema: content.dataPayload.schema,
            }
          : null,
        visualization: content.visualizationPayload
          ? {
              engine: content.visualizationPayload.engine,
              config: content.visualizationPayload.config,
              data: content.visualizationPayload.data,
            }
          : null,
        chat: content.chatPayload
          ? {
              messages: content.chatPayload.messages as Array<{
                role: string;
                content: string;
                timestamp: string;
              }>,
            }
          : null,
        hope: content.hopePayload
          ? {
              kind: content.hopePayload.kind,
              status: content.hopePayload.status,
              description: content.hopePayload.description,
            }
          : null,
        workflow: content.workflowPayload
          ? {
              engine: content.workflowPayload.engine,
              definition: content.workflowPayload.definition,
              enabled: content.workflowPayload.enabled,
            }
          : null,
      }}
    />
  );
}
