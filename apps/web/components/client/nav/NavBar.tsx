"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CompactLogo from "../logo/CompactLogo";
import type { SessionData } from "@/lib/auth/types";

export default function NavBar() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch session on mount
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

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      setSession(null);
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] bg-white border-b border-gray-200 shadow-sm"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex flex-row items-center h-16 w-full">
          {/* Logo inline with navigation */}
          <Link
            href="/"
            className="flex items-center hover:opacity-80 transition-opacity flex-shrink-0 mr-8 no-underline"
            style={{ textDecoration: "none" }}
          >
            <div className="h-10 w-10 flex items-center justify-center">
              <CompactLogo />
            </div>
          </Link>

          {/* Navigation buttons - inline and spread across screen */}
          <div className="flex flex-row items-center gap-8 flex-1">
            <Link
              href="/"
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors no-underline"
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Home
            </Link>
            <Link
              href="/about"
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors no-underline"
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              About
            </Link>
            <Link
              href="/content"
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors no-underline"
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Content
            </Link>
            <Link
              href="/contact"
              className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors no-underline"
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Contact
            </Link>
          </div>

          {/* Auth section */}
          <div className="flex flex-row items-center gap-4">
            {isLoading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
            ) : session ? (
              <>
                <span className="px-4 py-2 text-sm text-gray-700">
                  {session.user.username}
                </span>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors no-underline"
                style={{
                  textDecoration: "none",
                }}
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
