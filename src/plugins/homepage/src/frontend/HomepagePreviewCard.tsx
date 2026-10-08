import { LayoutGrid } from "lucide-react";
import {
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { HomepageCanvas } from "./HomepageCanvas.js";

export function HomepagePreviewCard({ shell }: DashboardCardProps) {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <LayoutGrid className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("homepage.previewTitle")}
        </span>
        <button
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => shell.openSingletonTab("homepage")}
        >
          {t("homepage.openFullView")}
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <HomepageCanvas isReadOnly={true} fitOnLoad={true} />
      </div>
    </div>
  );
}
