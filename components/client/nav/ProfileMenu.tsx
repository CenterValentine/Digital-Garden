"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Shield, LogOut, MessageSquare, Bug, Settings } from "lucide-react";
import type { SessionData } from "@/lib/infrastructure/auth/types";
import { getSurfaceStyles } from "@/lib/design-system";

export default function ProfileMenu() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const glass1 = getSurfaceStyles("glass-1");

  // Fetch session on mount
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { success: boolean; data: SessionData | null }) => {
        if (data.success && data.data) {
          setSession(data.data);
        }
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    console.log("[ProfileMenu] Sign out clicked"); // Debug log

    try {
      console.log("[ProfileMenu] Calling sign-out API..."); // Debug log

      // Call sign-out API
      const response = await fetch("/api/auth/sign-out", { method: "POST" });

      console.log("[ProfileMenu] Sign-out API response:", response.status); // Debug log

      if (!response.ok) {
        throw new Error("Sign out failed");
      }

      // Clear local session state
      setSession(null);

      // Close the menu
      setIsOpen(false);

      console.log("[ProfileMenu] Navigating to home page..."); // Debug log

      // Use full page navigation to ensure clean session clear
      // This prevents any stale client state from persisting
      window.location.href = "/";
    } catch (error) {
      console.error("[ProfileMenu] Sign out error:", error);
      // Even on error, try to navigate home
      window.location.href = "/";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!session) {
    return null; // Don't show menu if not authenticated
  }

  const userInitial = session.user.username.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar Circle */}
        <div className="h-8 w-8 rounded-full bg-gold-primary/20 border border-gold-primary flex items-center justify-center">
          <span className="text-gold-primary font-semibold text-sm">
            {userInitial}
          </span>
        </div>

        {/* Username - with truncation for long names */}
        <span className="text-foreground font-medium text-sm max-w-[120px] truncate">
          {session.user.username}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-white/10 shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-150 z-[200] bg-card/95"
          style={{
            backdropFilter: glass1.backdropFilter,
          }}
        >
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gold-primary/20 border border-gold-primary flex items-center justify-center">
                <span className="text-gold-primary font-semibold text-base">
                  {userInitial}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium text-sm truncate">
                  {session.user.username}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* Role Display */}
            <div className="px-4 py-2 flex items-center gap-3 text-muted-foreground">
              <Shield className="h-4 w-4 text-gold-primary" />
              <span className="text-sm">
                Role: <span className="text-foreground font-medium">{session.user.role}</span>
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/10 my-1" />

            {/* Settings */}
            <button
              type="button"
              onClick={() => {
                console.log("[ProfileMenu] Settings clicked");
                setIsOpen(false);
                router.push("/settings");
              }}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-foreground hover:bg-white/5 transition-colors text-left"
            >
              <Settings className="h-4 w-4 text-gold-primary" />
              <span>Settings</span>
            </button>

            {/* Divider */}
            <div className="h-px bg-white/10 my-1" />

            {/* Send Feedback */}
            <a
              href="https://github.com/CenterValentine/Digital-Garden/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-foreground hover:bg-white/5 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-gold-primary" />
              <span>Send Feedback</span>
            </a>

            {/* Report an Issue */}
            <a
              href="https://github.com/CenterValentine/Digital-Garden/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-foreground hover:bg-white/5 transition-colors"
            >
              <Bug className="h-4 w-4 text-gold-primary" />
              <span>Report an Issue</span>
            </a>

            {/* Divider */}
            <div className="h-px bg-white/10 my-1" />

            {/* Sign Out */}
            <button
              type="button"
              onClick={handleSignOut}
              onMouseEnter={() => console.log("[ProfileMenu] Mouse entered Sign Out button")}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-foreground hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-gold-primary" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
