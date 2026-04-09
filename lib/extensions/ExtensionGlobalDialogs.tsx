"use client";

import { getExtensionGlobalDialogs } from "./client-registry";

export function ExtensionGlobalDialogs() {
  return (
    <>
      {getExtensionGlobalDialogs().map((Dialog) => (
        <Dialog key={Dialog.displayName ?? Dialog.name} />
      ))}
    </>
  );
}
