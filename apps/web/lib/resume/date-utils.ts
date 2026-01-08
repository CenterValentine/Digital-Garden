import type { DateRange, ISODate } from "./types";

/**
 * Format ISO date to readable format (e.g., "Jan 2023")
 */
export function formatDate(date: ISODate): string {
  const d = new Date(date);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${month} ${year}`;
}

/**
 * Format date range for display (e.g., "Jan 2023 - Present" or "Jan 2023 - Dec 2024")
 */
export function formatDateRange(range: DateRange): string {
  const start = formatDate(range.start);
  const end = range.isCurrent
    ? "Present"
    : range.end
      ? formatDate(range.end)
      : "";

  return end ? `${start} - ${end}` : start;
}

/**
 * Sort date ranges by start date (most recent first)
 * Items without dateRange are placed at the end
 */
export function sortByDateRange<T extends { dateRange?: DateRange }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    // Items without dateRange go to the end
    if (!a.dateRange) return 1;
    if (!b.dateRange) return -1;

    const dateA = new Date(a.dateRange.start).getTime();
    const dateB = new Date(b.dateRange.start).getTime();
    return dateB - dateA; // Descending (most recent first)
  });
}

/**
 * Check if a date range is current
 */
export function isCurrentDateRange(range: DateRange): boolean {
  return range.isCurrent === true || !range.end;
}

/**
 * Get sort key for date range (for consistent sorting)
 */
export function getDateRangeSortKey(range: DateRange): string {
  const start = range.start;
  const end = range.isCurrent ? "9999-12-31" : range.end || "0000-01-01";
  return `${start}_${end}`;
}
