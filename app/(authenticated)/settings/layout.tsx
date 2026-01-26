/**
 * Settings Layout
 *
 * Sticky sidebar navigation with Liquid Glass design theme
 * Matches /notes layout design system
 */

import { getSurfaceStyles } from "@/lib/design/system";
import NotesNavBar from "@/components/client/nav/NotesNavBar";
import { NotesLayoutMarker } from "@/components/content/NotesLayoutMarker";
import { Toaster } from "@/components/client/ui/sonner";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

      <div className="settings-layout-page">
        <NotesLayoutMarker />
        <NotesNavBar />

        {/* Main content area */}
        <div
          className="fixed top-[56px] left-0 right-0 bottom-0 flex overflow-hidden"
          data-settings-layout
        >
          {/* Left Sidebar - Settings Navigation */}
          <div
            className="w-64 flex-shrink-0 border-r border-white/10 overflow-y-auto"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <SettingsSidebar />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto p-8">{children}</div>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <Toaster position="top-center" expand={true} richColors visibleToasts={5} />
    </>
  );
}
