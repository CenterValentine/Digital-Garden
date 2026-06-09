/**
 * generateAndStoreSpeech — generate speech with the configured provider, then
 * persist it as a ContentNode + FilePayload in the user's storage and return a
 * download URL. The audio twin of `generate-and-store.ts` (image): callers
 * (chat `generate_speech` tool, flashcard pronunciation endpoint) share the
 * exact generate→store→persist path instead of duplicating it.
 *
 * NOTE: unlike the image module there is no gateway path here — the Vercel AI
 * Gateway provider exposes no `speechModel()` in this SDK version, so v1 routes
 * directly to providers. Add a gateway branch here if/when the SDK gains one.
 */

import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content";
import { generateSpeech } from "./generate";
import {
  SPEECH_FORMAT_MIME,
  type SpeechFormat,
  type SpeechModelId,
  type SpeechProviderId,
} from "./types";
import { getUserSettings } from "@/lib/features/settings";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";

/** Persisted route override for the `generate_speech` tool. */
interface SpeechRouteOverride {
  presetId: string;
  modelId: string;
  voice?: string;
  language?: string;
}

/**
 * Resolve the effective speech-gen route for a user: honor a `generate_speech`
 * tool route override (a saved Connection) if configured, else fall back to the
 * requested provider/model. Best-effort — never throws on settings read errors.
 */
export async function resolveSpeechGenRoute(
  userId: string,
  aiArgs: { providerId: SpeechProviderId; modelId: SpeechModelId },
): Promise<{
  providerId: SpeechProviderId;
  modelId: SpeechModelId;
  apiKey?: string;
  voice?: string;
  language?: string;
}> {
  try {
    const settings = await getUserSettings(userId);
    const override = (
      settings.ai as
        | {
            toolConfig?: Record<
              string,
              { routeOverride?: SpeechRouteOverride }
            >;
          }
        | undefined
    )?.toolConfig?.generate_speech?.routeOverride;
    if (!override) return aiArgs;

    const conns = await listConnections(userId);
    const match = conns.find((c) => c.presetId === override.presetId);
    if (!match) return aiArgs;
    const withKey = await getConnectionWithKey(userId, match.id);

    return {
      providerId: override.presetId as SpeechProviderId,
      modelId: override.modelId as SpeechModelId,
      apiKey: withKey.apiKey,
      voice: override.voice,
      language: override.language,
    };
  } catch {
    return aiArgs;
  }
}

export interface GenerateAndStoreSpeechInput {
  text: string;
  userId: string;
  providerId?: SpeechProviderId;
  modelId?: SpeechModelId;
  voice?: string;
  language?: string;
  format?: SpeechFormat;
  speed?: number;
  /**
   * Explicit API key for a per-request provider choice. When provided (with
   * providerId/modelId), it is used directly and the saved generate_speech
   * route override is BYPASSED — so a per-batch provider pick wins over the
   * persisted default. Omit to use resolveSpeechGenRoute (saved default / env).
   */
  apiKey?: string;
  /**
   * Optional content label for the created node title (e.g. a flashcard term).
   * Falls back to a truncation of the spoken text.
   */
  label?: string;
}

export interface GeneratedStoredSpeech {
  /** ContentNode id of the persisted audio file. */
  contentId: string;
  /** Download URL for rendering. */
  url: string;
  mimeType: string;
  durationSeconds: number | null;
  providerId: string;
  modelId: string;
  fileName: string;
}

export async function generateAndStoreSpeech(
  input: GenerateAndStoreSpeechInput,
): Promise<GeneratedStoredSpeech> {
  const {
    text,
    userId,
    providerId = "openai",
    modelId = "tts-1",
    voice,
    language,
    format = "mp3",
    speed,
    apiKey,
    label,
  } = input;

  // Explicit key (per-request provider choice) bypasses the saved override;
  // otherwise resolve the user's configured route (override → env fallback).
  const resolved = apiKey
    ? { providerId, modelId, apiKey, voice, language }
    : await resolveSpeechGenRoute(userId, { providerId, modelId });

  const result = await generateSpeech(
    {
      text,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      voice: voice ?? resolved.voice,
      language: language ?? resolved.language,
      format,
      speed,
      apiKey: resolved.apiKey,
    },
    userId,
  );

  const audioBuffer = Buffer.from(result.base64, "base64");

  // Upload to the user's storage.
  const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
  const storageProvider = await getUserStorageProvider(userId);
  const crypto = await import("crypto");
  const checksum = crypto.createHash("sha256").update(audioBuffer).digest("hex");
  const fileExtension = mimeToExtension(result.mimeType);
  const timestamp = Date.now();
  const storageKey = `uploads/${userId}/ai-speech-${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

  await storageProvider.uploadFile(storageKey, audioBuffer, result.mimeType);

  // Persist as ContentNode + FilePayload.
  const baseLabel = label ?? text.slice(0, 60);
  const truncated = baseLabel.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
  const fileName = `${truncated || "ai-speech"}.${fileExtension}`;
  const slug = await generateUniqueSlug(fileName, userId);

  const content = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: fileName,
      slug,
      contentType: "file",
      parentId: null,
      role: "referenced",
      displayOrder: 0,
      filePayload: {
        create: {
          fileName,
          fileExtension,
          mimeType: result.mimeType,
          fileSize: BigInt(audioBuffer.length),
          checksum,
          storageProvider: "r2",
          storageKey,
          searchText: `AI generated speech: ${text.slice(0, 200)}`,
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: true,
          processingStatus: "complete",
        },
      },
    },
  });

  const url = await storageProvider.generateDownloadUrl(storageKey);

  return {
    contentId: content.id,
    url,
    mimeType: result.mimeType,
    durationSeconds: result.durationSeconds ?? null,
    providerId: result.providerId,
    modelId: result.modelId,
    fileName,
  };
}

/** Map an audio MIME type to a file extension for the storage key. */
function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/ogg": "opus",
  };
  return map[mimeType] ?? SPEECH_FORMAT_MIME_EXT[mimeType] ?? "mp3";
}

// Reverse of SPEECH_FORMAT_MIME for any format-derived mime not in the map above.
const SPEECH_FORMAT_MIME_EXT: Record<string, string> = Object.fromEntries(
  (Object.entries(SPEECH_FORMAT_MIME) as [SpeechFormat, string][]).map(
    ([fmt, mime]) => [mime, fmt],
  ),
);
