import { calendarBuiltInExtension } from "@/extensions/calendar/module";
import { peopleBuiltInExtension } from "@/extensions/people/module";
import { workplacesBuiltInExtension } from "@/extensions/workplaces/module";
import type { BuiltInExtension } from "./types";

export const BUILT_IN_EXTENSIONS: BuiltInExtension[] = [
  peopleBuiltInExtension,
  calendarBuiltInExtension,
  workplacesBuiltInExtension,
];
