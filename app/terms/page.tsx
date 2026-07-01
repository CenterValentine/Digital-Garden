/**
 * /terms — placeholder Terms of Service.
 *
 * Draft scaffold via the shared LegalDocument. Replace body copy with
 * reviewed legal text before launch.
 */

import type { Metadata } from "next";
import { PlatformShell, LegalDocument } from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of NoteTrellis.",
};

export default function Page() {
  return (
    <PlatformShell>
      <LegalDocument
        title="Terms of Service"
        effectiveDate="—"
        sections={[
          { heading: "Overview", body: "These terms govern your use of NoteTrellis. By using the service you agree to them. This is placeholder copy pending legal review." },
          { heading: "Using NoteTrellis", body: "You're responsible for your account and for keeping your credentials secure. You must be able to form a binding contract to use the service." },
          { heading: "Your content", body: "You own the content you create. You grant us the limited permissions needed to store, sync, and — where you choose to publish — display it." },
          { heading: "Acceptable use", body: "Don't use NoteTrellis to break the law, infringe others' rights, or disrupt the service for other people. Specific prohibited uses will be listed here." },
          { heading: "Publishing", body: "When you publish a page or connect a domain, you're responsible for the content you make public and for your rights to any material it contains." },
          { heading: "Availability & changes", body: "We work to keep the service reliable but provide it on an \"as is\" basis. We may update features and these terms; material changes will be noted above." },
          { heading: "Termination", body: "You may stop using the service and export your data at any time. We may suspend accounts that violate these terms." },
          { heading: "Contact", body: "Questions about these terms? Reach us via the Contact page." },
        ]}
      />
    </PlatformShell>
  );
}
