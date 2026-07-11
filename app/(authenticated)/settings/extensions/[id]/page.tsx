import { notFound } from "next/navigation";

import { ExtensionSettingsShell } from "@/components/settings/extensions/ExtensionSettingsShell";
import { EXTENSION_IDS } from "@/lib/extensions/manifests";

export default async function ExtensionSettingsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!EXTENSION_IDS.includes(id)) notFound();
  return <ExtensionSettingsShell extensionId={id} />;
}
