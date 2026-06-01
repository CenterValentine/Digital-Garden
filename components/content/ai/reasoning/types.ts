/**
 * Shared shape for reasoning block components.
 *
 * `streaming` reflects the parent message's status — true while the
 * model is actively producing the reasoning trace, false once the
 * answer has finished. Drives the auto-collapse + cursor indicator.
 */
export interface ReasoningBlockProps {
  text: string;
  streaming?: boolean;
}
