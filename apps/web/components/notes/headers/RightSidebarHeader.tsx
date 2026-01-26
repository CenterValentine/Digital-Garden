/**
 * Right Sidebar Header (Client Component)
 *
 * Tab navigation for switching between Backlinks, Outline, and Chat.
 * Uses inline SVG for consistency with LeftSidebarHeader pattern.
 */

"use client";

import type { RightSidebarTab } from "../RightSidebar";

interface RightSidebarHeaderProps {
  activeTab: RightSidebarTab;
  onTabChange: (tab: RightSidebarTab) => void;
}

export function RightSidebarHeader({ activeTab, onTabChange }: RightSidebarHeaderProps) {
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-white/10">
      <div className="flex w-full items-center justify-around">
        {/* Backlinks Tab */}
        <button
          onClick={() => onTabChange("backlinks")}
          className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
            activeTab === "backlinks"
              ? "border-b-2 border-gold-primary text-gold-primary"
              : "text-gray-400 hover:text-gray-300"
          }`}
          title="Backlinks"
          type="button"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </button>

        {/* Outline Tab */}
        <button
          onClick={() => onTabChange("outline")}
          className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
            activeTab === "outline"
              ? "border-b-2 border-gold-primary text-gold-primary"
              : "text-gray-400 hover:text-gray-300"
          }`}
          title="Outline"
          type="button"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
        </button>

        {/* Tags Tab */}
        <button
          onClick={() => onTabChange("tags")}
          className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
            activeTab === "tags"
              ? "border-b-2 border-gold-primary text-gold-primary"
              : "text-gray-400 hover:text-gray-300"
          }`}
          title="Tags"
          type="button"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        </button>

        {/* Chat Tab */}
        <button
          onClick={() => onTabChange("chat")}
          className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
            activeTab === "chat"
              ? "border-b-2 border-gold-primary text-gold-primary"
              : "text-gray-400 hover:text-gray-300"
          }`}
          title="AI Chat (Coming Soon)"
          type="button"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

