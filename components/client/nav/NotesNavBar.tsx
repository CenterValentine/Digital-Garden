"use client";

import NotesLogo from "../logo/NotesLogo";
import ProfileMenu from "./ProfileMenu";
import { getSurfaceStyles } from "@/lib/design-system";

/**
 * NotesNavBar - Minimal navbar for the notes application
 *
 * Features:
 * - Compact 56px height
 * - Logo in top-left corner
 * - Profile menu in top-right corner
 * - No navigation links (focused on note-taking)
 * - Matches glass-0 surface style for consistency with panels
 */
export default function NotesNavBar() {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] border-b border-white/10 h-[56px] shadow-sm"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <div className="w-full h-full px-4 flex items-center justify-between">
        {/* Left: Logo */}
        <NotesLogo />

        {/* Right: Profile Menu */}
        <ProfileMenu />
      </div>
    </nav>
  );
}
