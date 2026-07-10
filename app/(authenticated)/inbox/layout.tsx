/**
 * Inbox Layout
 *
 * Full-page unified inbox (notifications, messages, connections) under the
 * NotesNavBar shell. Mirrors the settings layout chrome; the two-pane inbox
 * body is owned by InboxShell (client).
 */

import NotesNavBar from "@/components/client/nav/NotesNavBar";
import { NotesLayoutMarker } from "@/components/content/NotesLayoutMarker";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

      <div className="inbox-layout-page">
        <NotesLayoutMarker />
        <NotesNavBar />

        <div className="fixed top-[56px] left-0 right-0 bottom-0 flex overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
