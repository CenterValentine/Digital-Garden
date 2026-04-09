"use client";

import { CheckCircle2, Puzzle } from "lucide-react";
import {
  getAllExtensionManifests,
  renderExtensionIcon,
} from "@/lib/extensions";
import { renderExtensionSettingsDialog } from "@/lib/extensions/client-registry";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useExtensionsUiStore } from "@/state/extensions-ui-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/client/ui/dialog";

export function LeftSidebarExtensions() {
  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);
  const selectedExtensionId = useExtensionsUiStore((state) => state.selectedExtensionId);
  const activeDialogExtensionId = useExtensionsUiStore((state) => state.activeDialogExtensionId);
  const openExtensionDialog = useExtensionsUiStore((state) => state.openExtensionDialog);
  const closeExtensionDialog = useExtensionsUiStore((state) => state.closeExtensionDialog);
  const extensions = getAllExtensionManifests();
  const enabledCount = extensions.filter((extension) => extension.enabledByDefault).length;
  const selectedExtension =
    extensions.find((extension) => extension.id === selectedExtensionId) ?? extensions[0] ?? null;
  const dialogExtension =
    extensions.find((extension) => extension.id === activeDialogExtensionId) ?? selectedExtension;
  const selectedPrimaryNavItem = dialogExtension?.navItems[0] ?? null;

  return (
    <>
      <div className="flex h-full flex-col overflow-y-auto p-4">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-gold-primary" />
            <h3 className="text-lg font-semibold text-white">Extensions</h3>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {enabledCount} built-in extension{enabledCount === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="grid max-h-[10.5rem] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {extensions.map((extension) => {
            const isSelected = selectedExtension?.id === extension.id;
            return (
              <button
                key={extension.id}
                type="button"
                onClick={() => openExtensionDialog(extension.id)}
                className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                  isSelected
                    ? "border-gold-primary/45 bg-gold-primary/10 text-gold-primary"
                    : "border-white/10 bg-white/[0.025] text-gray-300 hover:border-white/20 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/20 bg-current/10">
                  {renderExtensionIcon(extension.iconName, "h-6 w-6")}
                </div>
                <span className="max-w-full truncate text-sm font-semibold">
                  {extension.label}
                </span>
                <span className="text-[11px] text-gray-400">Open settings</span>
              </button>
            );
          })}
        </div>
      </div>

      {dialogExtension && (
        <Dialog
          open={activeDialogExtensionId === dialogExtension.id}
          onOpenChange={(open) => {
            if (!open) closeExtensionDialog();
          }}
        >
          <DialogContent className="max-h-[88vh] w-[min(1100px,92vw)] max-w-[1100px] overflow-hidden border-white/10 bg-[#0f1115] p-0 text-white">
            <div className="flex h-full max-h-[88vh] flex-col">
              <DialogHeader className="border-b border-white/10 px-6 py-5 text-left">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-primary/25 bg-gold-primary/10 text-gold-primary">
                    {renderExtensionIcon(dialogExtension.iconName, "h-6 w-6")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="truncate text-xl font-semibold">
                        {dialogExtension.label}
                      </DialogTitle>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Enabled
                      </span>
                    </div>
                    <DialogDescription className="mt-1 text-sm text-gray-400">
                      {dialogExtension.description ??
                        "Built-in extension settings and runtime configuration."}
                    </DialogDescription>
                  </div>
                  {selectedPrimaryNavItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView(selectedPrimaryNavItem.view);
                        closeExtensionDialog();
                      }}
                      className="rounded-md border border-gold-primary/30 px-3 py-1.5 text-xs font-medium text-gold-primary transition-colors hover:bg-gold-primary/10"
                    >
                      Open {selectedPrimaryNavItem.label}
                    </button>
                  )}
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {dialogExtension ? (
                  renderExtensionSettingsDialog(dialogExtension.id) ?? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-400">
                      Settings are not available for this extension yet.
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-400">
                    Settings are not available for this extension yet.
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
