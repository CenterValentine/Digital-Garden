/**
 * /privacy — placeholder Privacy Policy.
 *
 * Draft scaffold via the shared LegalDocument. Replace body copy with
 * reviewed legal text before launch.
 */

import type { Metadata } from "next";
import { PlatformShell, LegalDocument } from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How NoteTrellis collects, uses, and protects your information.",
};

export default function Page() {
  return (
    <PlatformShell>
      <LegalDocument
        title="Privacy Policy"
        effectiveDate="—"
        sections={[
          { heading: "Overview", body: "NoteTrellis is built around the idea that your notes are yours. This page explains, in plain terms, what information we handle and why. This is placeholder copy pending legal review." },
          { heading: "What we collect", body: "Account details you provide (such as your email), the content you create, and basic usage data needed to run and improve the service." },
          { heading: "How we use your information", body: "To operate your account, sync and publish your content, provide support, and keep the service secure. We do not sell your personal information." },
          { heading: "Your data is yours", body: "You can export your content at any time, and you may connect your own cloud storage and your own AI provider keys — keeping your files and AI usage under your control." },
          { heading: "Cookies & local storage", body: "We use essential cookies and browser storage to keep you signed in and remember preferences like your theme. Details will be itemized here." },
          { heading: "Changes to this policy", body: "We'll update this page as the service evolves and note the effective date above when we do." },
          { heading: "Contact", body: "Questions about privacy? Reach us via the Contact page and we'll be glad to help." },
        ]}
      />
    </PlatformShell>
  );
}
