import { Activity } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { StatusBoard } from "./StatusBoard";
import { STATUS_TAB } from "./views";
import { WallLayout } from "./WallLayout";

export function activate(app: TermixApp): void {
  app.registerLayout({
    id: "wall",
    label: "layout.name",
    component: WallLayout,
  });
  // Host Status has no page of its own, so the board is ours.
  app.registerTab(STATUS_TAB, StatusBoard, {
    icon: Activity,
    titleKey: "board.title",
    singleton: true,
    hostless: true,
  });
}
