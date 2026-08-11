import type { Metadata } from "next";
import { DemoPage } from "@/components/personal/DemoPage";

export const metadata: Metadata = {
  title: "Product demo — David Valentine",
  description:
    "A guided video tour of the Digital Garden: AI chat with tool calls, agent playbooks, durable workflows, live collaboration, and publishing. Request a custom demo.",
};

/**
 * Dedicated static route for /demo (linked from the GitHub README).
 *
 * Same rationale as /resume: this bypasses the [...path] catch-all handler,
 * whose tenant-detection path can fail during client-side RSC navigation.
 * A static route keeps this recruiter-facing URL reliable.
 */
export default function DemoRoute() {
  return <DemoPage />;
}
