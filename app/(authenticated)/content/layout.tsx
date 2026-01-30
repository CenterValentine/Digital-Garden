/**
 * Notes Layout (Server Component)
 *
 * Renders panel structure immediately, before JavaScript loads.
 * ResizablePanels handles only the interactive resizing.
 */

// app/(authenticated)/content/layout.tsx
import { getSurfaceStyles } from "@/lib/design/system";
import { ConditionalNotesLayout } from "@/components/content/ConditionalNotesLayout";
import { NotesLayoutMarker } from "@/components/content/NotesLayoutMarker";

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <>
      {/* Inline style to immediately hide default navbar before CSS loads */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .notes-route-hides-default-nav { display: none !important; }
          .notes-route-no-padding { padding-top: 0 !important; }
        `
      }} />

      <div className="notes-layout-page">
        {/* Mark body element to trigger CSS for hiding default navbar */}
        <NotesLayoutMarker />

        {/* Conditional layout: full panels or just children (fullscreen) */}
        <ConditionalNotesLayout glass0={glass0}>
          {children}
        </ConditionalNotesLayout>
      </div>
    </>
  );
}
