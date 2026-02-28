/**
 * AI Settings Route Page
 *
 * Thin wrapper that renders the AISettingsPage client component.
 * Kept separate because AISettingsPage will grow across sprints
 * (tools, BYOK, speech, RAG sections added in Sprints 34-36).
 */

import AISettingsPage from "@/components/settings/AISettingsPage";

export default function AISettingsRoute() {
  return <AISettingsPage />;
}
