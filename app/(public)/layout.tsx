import React from "react";

// This layout wraps all public-facing pages.
// It is nested under app/layout.tsx (root) which provides html/body.
// We suppress the default app nav via CSS (same pattern as the notes route).
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // public-route class is used in globals.css to suppress the app nav
    // and remove the default pt-20 padding applied by the root layout
    <div className="public-route min-h-screen bg-[#0a0a0a] text-white">
      {children}
    </div>
  );
}
