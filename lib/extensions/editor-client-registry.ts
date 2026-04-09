import type { Extensions } from "@tiptap/core";
import {
  getExtensionClientEditorExtensions as getRegisteredExtensionClientEditorExtensions,
  getExtensionSlashCommands as getRegisteredExtensionSlashCommands,
} from "./client-registry";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";

export function getExtensionClientEditorExtensions(): Extensions {
  return getRegisteredExtensionClientEditorExtensions();
}

export function getExtensionSlashCommands(): SlashCommand[] {
  return getRegisteredExtensionSlashCommands();
}
