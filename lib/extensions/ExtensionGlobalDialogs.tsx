"use client";

import { useExtensionGlobalDialogs } from "./client-registry";

export function ExtensionGlobalDialogs() {
  const dialogs = useExtensionGlobalDialogs();
  return (
    <>
      {dialogs.map((Dialog) => (
        <Dialog key={Dialog.displayName ?? Dialog.name} />
      ))}
    </>
  );
}
