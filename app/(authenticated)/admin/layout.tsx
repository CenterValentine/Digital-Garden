/**
 * Admin Panel Layout
 *
 * Sticky sidebar navigation with Liquid Glass design theme.
 * Owner role REQUIRED - redirects non-owners to /content.
 */

import { redirect } from "next/navigation";
import { getSurfaceStyles } from "@/lib/design-system";
import NotesNavBar from "@/components/client/nav/NotesNavBar";
import { NotesLayoutMarker } from "@/components/content/NotesLayoutMarker";
import { Toaster } from "@/components/client/ui/sonner";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { requireRole } from "@/lib/infrastructure/auth/middleware";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side role check
  try {
    await requireRole("owner");
  } catch {
    redirect("/content"); // Redirect non-owners
  }

  const glass0 = getSurfaceStyles("glass-0");

  return (
    <>
      {/* Hide default navbar, use NotesNavBar */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .notes-route-hides-default-nav { display: none !important; }
          .notes-route-no-padding { padding-top: 0 !important; }
        `,
        }}
      />

      <div className="admin-layout-page">
        <NotesLayoutMarker />
        <NotesNavBar />

        {/* Main content area */}
        <div
          className="fixed top-[56px] left-0 right-0 bottom-0 flex overflow-hidden"
          data-admin-layout
        >
          {/* Left Sidebar - Admin Navigation */}
          <div
            className="w-64 flex-shrink-0 border-r border-white/10 overflow-y-auto"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <AdminSidebar />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-8">{children}</div>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <Toaster position="top-center" expand={true} richColors visibleToasts={5} />
    </>
  );
}
