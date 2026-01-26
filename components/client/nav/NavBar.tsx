"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBarLogo from "../logo/NavBarLogo";
import { Button } from "@/components/client/ui/button/Button";
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
    <nav className="fixed top-0 left-0 right-0 z-[100] bg-card border-b border-border shadow-sm h-[72px]">
      <div className="w-full h-full">
        <div className="flex flex-row items-stretch justify-center h-full w-full">
          {/* Left navigation buttons */}
          <div className="flex flex-row items-stretch flex-1 justify-end">
            <Button variant="nav-item" size="full" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="nav-item" size="full" asChild>
              <Link href="/about">About</Link>
            </Button>
          </div>

          {/* Spacing container - displaces buttons to make room for medallion */}
          <div className="w-36 shrink-0" aria-hidden="true" />

          {/* Center logo with medallion - overflows navbar, absolutely positioned */}
          <NavBarLogo />

          {/* Right navigation buttons */}
          <div className="flex flex-row items-stretch flex-1 justify-start">
            <Button variant="nav-item" size="full" asChild>
              <Link href="/content">Content</Link>
            </Button>
            <Button variant="nav-item" size="full" asChild>
              <Link href="/contact">Contact</Link>
            </Button>
          </div>

          {/* Auth section - absolute positioned to the right, vertically centered */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-row items-center gap-4">
            {isLoading ? (
              <span className="px-4 py-2 text-sm text-muted-foreground">
                Loading...
              </span>
            ) : session ? (
              <>
                <span className="px-4 py-2 text-sm text-foreground">
                  {session.user.username}
                </span>
                <Button variant="ghost" onClick={handleSignOut}>
                  Sign Out
                </Button>
              </>
            ) : (
              <Button variant="gradient-gold-soft" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
