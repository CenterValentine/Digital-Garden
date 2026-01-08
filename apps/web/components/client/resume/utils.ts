import type { Location } from "@/lib/resume/types";

export function formatLocation(location: Location): string {
  const parts: string[] = [];

  if (location.city) parts.push(location.city);
  if (location.region) parts.push(location.region);
  if (location.country) parts.push(location.country);
  if (location.remoteType) {
    parts.push(`(${location.remoteType})`);
  }

  return parts.join(", ");
}
