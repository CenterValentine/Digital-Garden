"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CompactLogo from "../logo/CompactLogo";
import { Button } from "@/components/ui/button/Button";
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
    <nav className="fixed top-0 left-0 right-0 z-[100] bg-card border-b border-border shadow-sm h-20">
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
          <div className="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center mt-1">
            <Link
              href="/"
              className="absolute top-0 flex items-start justify-center no-underline group z-[101] "
            >
              {/* White background circle - sized to just contain text with minimal gap */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-background" />

              {/* SVG with curved text - sized to match background */}
              <svg viewBox="0 0 100 100" className="w-32 h-32 relative z-10">
                <defs>
                  {/* 
                    Arc positioning guide:
                    - The "50" is the Y position (vertical center of viewBox)
                    - INCREASE to move text DOWN, DECREASE to move UP
                    - The "35 35" is the arc radius - smaller = tighter curve
                    - "15" and "85" are left/right X endpoints
                  */}
                  {/* Arc for "David's" - shifted down to sit just above medallion */}
                  <path
                    id="textArcTop"
                    d="M 15 40 A 25 25 0 0 1 85 50"
                    fill="none"
                  />
                  {/* Arc for "Digital Garden" - shifted down to sit just below medallion */}
                  <path
                    id="textArcBottom"
                    d="M 9 73 A 45 45 0 0 0 89 73"
                    fill="none"
                  />
                </defs>

                {/* "David's" curved on top - 3x size */}
                <text
                  fontSize="12.75"
                  fontWeight="1000"
                  letterSpacing="1.5"
                  style={{ fill: "var(--gold-primary)" }}
                >
                  <textPath
                    href="#textArcTop"
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    David&apos;s
                  </textPath>
                </text>

                {/* "Digital Garden" curved on bottom */}
                <text
                  fontSize="11"
                  fontWeight="600"
                  letterSpacing="1"
                  style={{ fill: "var(--gold-primary)" }}
                >
                  <textPath
                    href="#textArcBottom"
                    startOffset="50%"
                    textAnchor="middle"
                  >
                    Digital Garden
                  </textPath>
                </text>
              </svg>

              {/* Medallion centered - fills most of center, minimal gap to text */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="relative h-24 w-24 flex items-center justify-center">
                  {/* Medallion ring */}
                  <div className="absolute inset-0 rounded-full border-2 border-gold-primary bg-gradient-to-br from-gold-light/30 to-shale-dark/40 shadow-glow-gold group-hover:shadow-glow-leaf transition-shadow duration-300" />
                  {/* Inner ring */}
                  <div className="absolute inset-0.5 rounded-full border border-gold-dark/50 bg-background" />
                  {/* Logo container */}
                  <div className="relative h-20 w-20 flex items-center justify-center z-10">
                    <CompactLogo />
                  </div>
                </div>
              </div>
            </Link>
          </div>

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
