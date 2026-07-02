import { ResumePage } from "@/components/personal/ResumePage";

/**
 * Dedicated static route for /resume.
 *
 * This bypasses the [...path] catch-all handler which uses withPageTrace +
 * getCurrentTenant() — those server utilities can fail to resolve correctly
 * during client-side RSC navigation (the RSC fetch goes through
 * /_next/data/... with different header context). A static route avoids the
 * entire tenant-detection path, fixing blank pages on Link navigation.
 */
export default function ResumeRoute() {
  return <ResumePage />;
}
