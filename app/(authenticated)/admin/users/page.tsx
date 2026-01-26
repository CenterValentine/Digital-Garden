/**
 * Admin Users Management Page
 *
 * List all users with search, filter, and actions (change role, delete).
 */

"use client";

import { useEffect, useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import type { AdminUserListItem } from "@/lib/domain/admin/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Input } from "@/components/client/ui/input";
import { Button } from "@/components/client/ui/button";
import { ChangeRoleDialog } from "@/components/admin/ChangeRoleDialog";
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog";
import { toast } from "sonner";

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [dialogMode, setDialogMode] = useState<"role" | "delete" | null>(null);

  const glass0 = getSurfaceStyles("glass-0");

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      const response = await fetch(`/api/admin/users?${params}`);
      const result = await response.json();

      if (result.success) {
        setUsers(result.data.users);
      } else {
        toast.error("Failed to load users");
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const handleRoleChange = async (userId: string, newRole: string, reason?: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, reason }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Role changed successfully`);
        fetchUsers(); // Refresh list
        setDialogMode(null);
        setSelectedUser(null);
      } else {
        toast.error(result.error?.message || "Failed to change role");
      }
    } catch (error) {
      console.error("Failed to change role:", error);
      toast.error("Failed to change role");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          `User deleted (${result.data.contentDeleted} items removed)`
        );
        fetchUsers(); // Refresh list
        setDialogMode(null);
        setSelectedUser(null);
      } else {
        toast.error(result.error?.message || "Failed to delete user");
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    }
  };

  if (loading) {
    return <UsersSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage user accounts and roles
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-4">
        <Input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Users Table */}
      <div
        className="border border-white/10 rounded-lg overflow-hidden"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <table className="w-full">
          <thead className="border-b border-white/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Content
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Storage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-white/5">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium">{user.username}</div>
                    <div className="text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getRoleBadgeClass(
                      user.role
                    )}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">{user.contentCount}</td>
                <td className="px-6 py-4 text-sm">{user.storageUsage}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {user.lastActivity
                    ? formatDate(user.lastActivity)
                    : "Never"}
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(user);
                      setDialogMode("role");
                    }}
                  >
                    Change Role
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(user);
                      setDialogMode("delete");
                    }}
                    className="text-red-500 hover:text-red-400"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No users found
          </div>
        )}
      </div>

      {/* Dialogs */}
      {selectedUser && dialogMode === "role" && (
        <ChangeRoleDialog
          user={selectedUser}
          onClose={() => {
            setDialogMode(null);
            setSelectedUser(null);
          }}
          onConfirm={handleRoleChange}
        />
      )}

      {selectedUser && dialogMode === "delete" && (
        <DeleteUserDialog
          user={selectedUser}
          onClose={() => {
            setDialogMode(null);
            setSelectedUser(null);
          }}
          onConfirm={handleDeleteUser}
        />
      )}
    </div>
  );
}

// Helper Functions

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case "owner":
      return "bg-purple-500/20 text-purple-300";
    case "admin":
      return "bg-blue-500/20 text-blue-300";
    case "member":
      return "bg-green-500/20 text-green-300";
    case "guest":
      return "bg-gray-500/20 text-gray-300";
    default:
      return "bg-gray-500/20 text-gray-300";
  }
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UsersSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-96" />
    </div>
  );
}
