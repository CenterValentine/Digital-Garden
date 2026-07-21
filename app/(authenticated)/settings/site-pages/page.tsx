/**
 * Settings → Site Pages
 *
 * The visual composer for code-driven pages (Results, Field Notes…). Pick a
 * page, arrange its sections, and connect published content — no JSON required.
 * Edits autosave as drafts; "Publish changes" promotes them to the live site.
 *
 * "Edit as JSON" remains available inside the composer as the power-user
 * escape hatch over the same config (validated by the same Zod schema the
 * renderer uses). See docs/notes-feature/work-tracking/SITE-PAGES-COMPOSER-PLAN.md.
 */

import { SitePagesComposer } from "@/components/settings/site-pages/SitePagesComposer";

export default function SitePagesSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Site Pages</h1>
        <p className="text-muted-foreground mt-2">
          Compose your site&apos;s code-driven pages. Arrange sections, connect
          published directories and items, and override how each row displays —
          your published notes are never modified. Changes save as a draft until
          you publish them.
        </p>
      </div>

      <SitePagesComposer />
    </div>
  );
}
