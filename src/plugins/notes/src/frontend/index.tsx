import { NotebookPen } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { NotesTab } from "./NotesTab";
import { PinnedCard } from "./PinnedCard";
import { NotesCompanion, useNotesCompanionDefaults } from "./NotesCompanion";

const TAB_ID = "notes";

type Settings = Record<string, Record<string, unknown> | undefined>;

function settingsOf(host: object | null | undefined) {
  return (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as Settings | undefined;
}

/** Notes are on for every host unless its switch was turned off. */
export function notesEnabled(host: object | null | undefined): boolean {
  return settingsOf(host)?.[TAB_ID]?.enableNotes !== false;
}

export function notesPanelEnabled(host: object | null | undefined): boolean {
  return notesEnabled(host) && settingsOf(host)?.[TAB_ID]?.showPanel !== false;
}

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, NotesTab, {
    icon: NotebookPen,
    titleKey: "tab.title",
    requiresHost: false,
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: NotebookPen,
    kind: "open",
    order: 48,
    tabType: TAB_ID,
    when: (host) => canUse && notesEnabled(host),
  });
  app.registerDashboardCard({
    id: "notes-pinned",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: PinnedCard,
  });
  app.registerPaletteEntry({
    id: "notes.open",
    titleKey: "tab.title",
    icon: NotebookPen,
    keywords: ["notes", "markdown", "write"],
    scope: "global",
    run: (shell) => {
      shell.openSingletonTab(TAB_ID);
    },
  });

  app.registerCompanion(TAB_ID, NotesCompanion, {
    icon: NotebookPen,
    titleKey: "tab.title",
    order: 130,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && notesPanelEnabled(host),
    useDefaults: useNotesCompanionDefaults,
  });
  app.registerAction("notes.togglePanel", ((_handle: unknown, tab: unknown) =>
    app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: "notes.togglePanel",
    titleKey: "companion.toggle",
    icon: NotebookPen,
    kind: "button",
    order: 16,
    when: (context) => {
      const tab = context.tab as {
        type?: string;
        host?: unknown;
        hostConfig?: unknown;
      } | null;
      return (
        tab?.type === "terminal" &&
        notesPanelEnabled((tab.host ?? tab.hostConfig) as object)
      );
    },
  });
}
