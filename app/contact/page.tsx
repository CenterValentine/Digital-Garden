/**
 * /contact — placeholder Contact page.
 *
 * Email contact methods. A real contact form can replace the mailto cards
 * later. Email addresses are placeholders — swap for real inboxes pre-launch.
 */

import type { Metadata } from "next";
import { PlatformShell, MarketingPageHeader } from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the NoteTrellis team — support and general inquiries.",
};

const CHANNELS = [
  {
    label: "General",
    email: "hello@notetrellis.com",
    body: "Questions, feedback, partnerships, or just to say hello.",
  },
  {
    label: "Support",
    email: "support@notetrellis.com",
    body: "Trouble with your account, your editor, or your published site.",
  },
];

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Support"
        title="Contact us"
        lede="We'd love to hear from you. A contact form is coming; for now, email is the fastest way to reach us."
      />
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <a
              key={c.email}
              href={`mailto:${c.email}`}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-5 hover:border-emerald-500/30 transition-colors block"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-400/70 mb-2">
                {c.label}
              </p>
              <p className="text-sm text-white/50 leading-relaxed mb-3">{c.body}</p>
              <span className="text-sm font-medium text-emerald-300">{c.email}</span>
            </a>
          ))}
        </div>
      </section>
    </PlatformShell>
  );
}
