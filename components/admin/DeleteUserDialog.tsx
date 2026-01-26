/**
 * Delete User Dialog
 *
 * Confirmation dialog for deleting a user with content count warning.
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/client/ui/dialog";
import { Button } from "@/components/client/ui/button";
import type { AdminUserListItem } from "@/lib/domain/admin/api-types";

interface DeleteUserDialogProps {
  user: AdminUserListItem;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}

export function DeleteUserDialog({
  user,
  onClose,
  onConfirm,
}: DeleteUserDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onConfirm(user.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-500">Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this user? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User Info */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="font-medium">{user.username}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>

          {/* Warning */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>This will permanently delete:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>{user.contentCount} content items</li>
              <li>All user sessions</li>
              <li>All account connections</li>
              <li>All associated data</li>
            </ul>
            <p className="text-red-400 font-medium mt-4">
              This action is irreversible!
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Deleting..." : "Delete User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
