/**
 * ReasoningRouter — picks a reasoning block renderer based on the
 * *message's* providerId (stamped at send time), not the panel's
 * active provider. This matters for branched / mixed-provider chats:
 * each historical message stays styled in the provider that produced it.
 */

"use client";

import { ReasoningBlockClaude } from "./ReasoningBlockClaude";
import { ReasoningBlockChatGPT } from "./ReasoningBlockChatGPT";
import { ReasoningBlockGemini } from "./ReasoningBlockGemini";
import { ReasoningBlockGeneric } from "./ReasoningBlockGeneric";

interface ReasoningRouterProps {
  providerId: string | null | undefined;
  text: string;
  streaming?: boolean;
}

export function ReasoningRouter({
  providerId,
  text,
  streaming,
}: ReasoningRouterProps) {
  switch (providerId) {
    case "anthropic":
      return <ReasoningBlockClaude text={text} streaming={streaming} />;
    case "openai":
      return <ReasoningBlockChatGPT text={text} streaming={streaming} />;
    case "google":
      return <ReasoningBlockGemini text={text} streaming={streaming} />;
    default:
      return <ReasoningBlockGeneric text={text} streaming={streaming} />;
  }
}
