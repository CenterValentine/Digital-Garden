/**
 * Confirm Dialog Component
 *
 * Reusable confirmation dialog using Radix UI primitives.
 * Matches Liquid Glass design system.
 *
 * Usage:
 * ```tsx
 * const [confirmOpen, setConfirmOpen] = useState(false);
 *
 * <ConfirmDialog
 *   open={confirmOpen}
 *   onOpenChange={setConfirmOpen}
 *   title="Delete file?"
 *   description="This will move it to trash."
 *   confirmLabel="Delete"
 *   confirmVariant="danger"
 *   onConfirm={() => {
 *     // Handle confirmation
 *   }}
 * />
 * ```
 */

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Info, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  // Icon based on variant
  const Icon = confirmVariant === "danger" || confirmVariant === "warning"
    ? AlertTriangle
    : Info;

  // Icon color based on variant
  const iconColor =
    confirmVariant === "danger"
      ? "text-red-400"
      : confirmVariant === "warning"
      ? "text-yellow-400"
      : "text-blue-400";

  // Button styles based on variant
  const confirmButtonClass =
    confirmVariant === "danger"
      ? "bg-red-500/20 text-red-300 hover:bg-red-500/30 border-red-500/30"
      : confirmVariant === "warning"
      ? "bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border-yellow-500/30"
      : "bg-primary/20 text-primary hover:bg-primary/30 border-primary/30";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Content */}
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border border-white/10 bg-[#1a1a1a] p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          onOpenAutoFocus={(e) => {
            // Focus the cancel button by default (safer)
            e.preventDefault();
            const cancelButton = document.getElementById("confirm-dialog-cancel");
            if (cancelButton) {
              cancelButton.focus();
            }
          }}
        >
          {/* Close button */}
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`shrink-0 ${iconColor}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <Dialog.Title className="text-lg font-semibold text-white">
                {title}
              </Dialog.Title>
            </div>
          </div>

          {/* Description */}
          <Dialog.Description className="text-sm text-gray-400 mb-6 ml-10 whitespace-pre-line">
            {description}
          </Dialog.Description>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            {cancelLabel && (
              <button
                id="confirm-dialog-cancel"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 rounded border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
              >
                {cancelLabel}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 text-sm font-medium rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 ${confirmButtonClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
