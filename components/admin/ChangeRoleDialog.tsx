/**
 * Change Role Dialog
 *
 * Dialog for changing a user's role with optional reason field.
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
import { Label } from "@/components/client/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";
import { Textarea } from "@/components/client/ui/textarea";
import type { AdminUserListItem } from "@/lib/domain/admin/api-types";

interface ChangeRoleDialogProps {
  user: AdminUserListItem;
  onClose: () => void;
  onConfirm: (userId: string, newRole: string, reason?: string) => Promise<void>;
}

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

export function ChangeRoleDialog({
  user,
  onClose,
  onConfirm,
}: ChangeRoleDialogProps) {
  const [newRole, setNewRole] = useState(user.role);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (newRole === user.role) {
      return; // No change
    }

    setSubmitting(true);
    try {
      await onConfirm(user.id, newRole, reason || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change User Role</DialogTitle>
          <DialogDescription>
            Change role for user: <strong>{user.username}</strong> ({user.email})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Role */}
          <div>
            <Label className="text-muted-foreground text-sm">Current Role</Label>
            <div className="mt-1 text-lg capitalize">{user.role}</div>
          </div>

          {/* New Role Select */}
          <div>
            <Label htmlFor="new-role">New Role</Label>
            <Select value={newRole} onValueChange={(value) => setNewRole(value as any)}>
              <SelectTrigger id="new-role" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem
                    key={role.value}
                    value={role.value}
                    disabled={role.value === user.role}
                  >
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Reason */}
          <div>
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Textarea
              id="reason"
              placeholder="Why is this role being changed?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={newRole === user.role || submitting}
          >
            {submitting ? "Changing..." : "Change Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
