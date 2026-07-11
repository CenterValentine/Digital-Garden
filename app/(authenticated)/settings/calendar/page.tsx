import { redirect } from "next/navigation";

/** Legacy route — calendar settings moved to the Extensions group. */
export default function LegacyCalendarSettingsRoute() {
  redirect("/settings/extensions/calendar");
}
