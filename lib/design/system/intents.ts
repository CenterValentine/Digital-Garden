/**
 * Semantic Intent Colors
 *
 * Unified color intent system across all routes.
 */

export const intents = {
  primary: "hsl(222, 47%, 51%)", // Blue
  secondary: "hsl(222, 13%, 45%)", // Gray-blue
  neutral: "hsl(215, 14%, 34%)", // Neutral gray
  danger: "hsl(0, 72%, 51%)", // Red
  success: "hsl(142, 71%, 45%)", // Green
  warning: "hsl(38, 92%, 50%)", // Orange
  info: "hsl(199, 89%, 48%)", // Cyan
} as const;

export type Intent = keyof typeof intents;

/**
 * Get intent color value
 */
export function getIntentColor(intent: Intent): string {
  return intents[intent];
}

/**
 * Intent color with opacity
 */
export function getIntentColorWithOpacity(
  intent: Intent,
  opacity: number
): string {
  const color = intents[intent];
  // Convert HSL to HSLA
  return color.replace("hsl(", `hsla(`).replace(")", `, ${opacity})`);
}
