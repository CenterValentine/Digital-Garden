/**
 * Admin Content Overview Page
 *
 * View all content across users (read-only).
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSurfaceStyles } from "@/lib/design/system";
import type { AdminContentListItem } from "@/lib/domain/admin/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Input } from "@/components/client/ui/input";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";

export default function ContentPage() {
  const [items, setItems] = useState<AdminContentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const glass0 = getSurfaceStyles("glass-0");

  const fetchContent = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      const response = await fetch(`/api/admin/content?${params}`);
      const result = await response.json();

      if (result.success) {
        setItems(result.data.items);
      } else {
        toast.error("Failed to load content");
      }
    } catch (error) {
      console.error("Failed to fetch content:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, [search]);

  if (loading) {
    return <ContentSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Content Overview</h1>
        <p className="text-muted-foreground mt-2">
          View all content across users (read-only)
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-4">
        <Input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Content Table */}
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
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Owner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Updated
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-white/5">
                <td className="px-6 py-4">
                  <div className="font-medium">{item.title}</div>
                  {item.fileSize && (
                    <div className="text-sm text-muted-foreground">
                      {item.fileSize}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm">{item.ownerUsername}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-300 capitalize">
                    {item.contentType}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {item.isPublished ? (
                    <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300">
                      Published
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-300">
                      Draft
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {formatDate(item.updatedAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/admin/content/${item.id}`}>
                    <Button variant="ghost" size="sm">
                      View Details
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No content found
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ContentSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-96" />
    </div>
  );
}
