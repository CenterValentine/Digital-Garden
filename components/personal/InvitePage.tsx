"use client";

import { useState } from "react";
import Link from "next/link";
import "./invite.css";

type Status = "idle" | "loading" | "success" | "error";

export function InvitePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/invite-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="nt-invite">
      {/* ── Header ── */}
      <header className="nt-inv-header">
        <Link href="/" className="nt-inv-logo">
          NoteTrellis<span className="nt-inv-dot">.</span>
        </Link>
        <Link href="/sign-in" className="nt-inv-signin">
          Sign in
        </Link>
      </header>

      {/* ── Main ── */}
      <main className="nt-inv-main">
        <div className="nt-inv-card">
          <span className="nt-inv-kicker">By invitation</span>

          <h1 className="nt-inv-title">
            Start a{" "}
            <span className="nt-inv-em">digital garden.</span>
          </h1>

          <p className="nt-inv-body">
            Note Trellis is a knowledge tool for people who think in
            connections — interlinked notes, living essays, slow ideas, published
            as a personal digital garden.
          </p>
          <p className="nt-inv-body">
            Access is currently by invitation. Leave your email and{" "}
            we&apos;ll be in touch when a spot opens.
          </p>

          {status === "success" ? (
            <div className="nt-inv-success">
              <span className="nt-inv-success-icon">✦</span>
              <p className="nt-inv-success-title">You&apos;re on the list.</p>
              <p className="nt-inv-success-sub">
                We&apos;ll reach out at <strong>{email}</strong> when
                an invitation is ready.
              </p>
            </div>
          ) : (
            <form className="nt-inv-form" onSubmit={handleSubmit}>
              <div className="nt-inv-field">
                <label htmlFor="inv-email" className="nt-inv-label">
                  Your email
                </label>
                <input
                  id="inv-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="nt-inv-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                />
              </div>

              {status === "error" && (
                <p className="nt-inv-error">
                  Something went wrong — please try again.
                </p>
              )}

              <button
                type="submit"
                className="nt-inv-btn"
                disabled={status === "loading" || !email.trim()}
              >
                {status === "loading" ? "Sending…" : "Request an invitation"}
              </button>
            </form>
          )}

          <p className="nt-inv-foot">
            Already have an account?{" "}
            <Link href="/sign-in" className="nt-inv-link">
              Sign in
            </Link>
          </p>
        </div>

        {/* Decorative trellis grid */}
        <div className="nt-inv-trellis" aria-hidden="true">
          <svg viewBox="0 0 320 420" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Vertical trellis lines */}
            {[0, 80, 160, 240, 320].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2="420"
                stroke="#4ade80" strokeWidth="0.6" strokeOpacity="0.18" />
            ))}
            {/* Horizontal trellis lines */}
            {[0, 70, 140, 210, 280, 350, 420].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2="320" y2={y}
                stroke="#4ade80" strokeWidth="0.6" strokeOpacity="0.18" />
            ))}
            {/* Diagonal vine strokes */}
            <path d="M0 420 C 60 300 120 180 160 90 C 200 0 260 -60 320 -80"
              stroke="#4ade80" strokeWidth="1.2" strokeOpacity="0.22"
              strokeLinecap="round" fill="none" />
            <path d="M-40 280 C 40 220 120 160 200 120 C 260 90 310 80 340 70"
              stroke="#4ade80" strokeWidth="0.9" strokeOpacity="0.15"
              strokeLinecap="round" fill="none" />
            {/* Leaf nodes at intersections */}
            {[[160, 90], [80, 210], [240, 140], [120, 350]].map(([cx, cy]) => (
              <circle key={`n${cx}${cy}`} cx={cx} cy={cy} r="3.5"
                fill="#4ade80" fillOpacity="0.28" />
            ))}
          </svg>
        </div>
      </main>
    </div>
  );
}
