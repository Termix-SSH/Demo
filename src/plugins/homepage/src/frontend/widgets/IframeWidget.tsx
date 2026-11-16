import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Globe } from "lucide-react";
import { registerWidget } from "./WidgetRegistry";
import type { IframeConfig, WidgetComponentProps } from "../types.js";
import { GRID_SIZE } from "../types.js";
import { NativeView, WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import { openEmbeddedPage } from "../api.js";

// Termix 26.11.2 draws a granted page itself; a plugin view can't frame
// another site.
const GrantedView = NativeView as unknown as ComponentType<{
  grant: string;
  className?: string;
}>;

function IframeWidget({
  widget,
  config,
  isReadOnly,
}: WidgetComponentProps<IframeConfig>) {
  const { t } = useTranslation();
  const { url } = config;
  const [grant, setGrant] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setGrant(null);
    setFailed(false);
    if (!url) return;
    let live = true;
    openEmbeddedPage(widget.id)
      .then((next) => {
        if (live) setGrant(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [url, widget.id]);

  if (!url || failed) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-muted-foreground/50">
        <Globe size={24} />
        <span className="text-xs">
          {t(failed ? "homepage.embedFailed" : "homepage.configureUrl")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Globe size={11} />} />
      <div className="relative flex-1">
        {grant && (
          <GrantedView key={grant} grant={grant} className="w-full h-full" />
        )}
        {/* Block interaction in read-only mode so the canvas can still pan */}
        {isReadOnly && <div className="absolute inset-0 pointer-events-none" />}
      </div>
    </div>
  );
}

registerWidget<IframeConfig>({
  id: "iframe_embed",
  name: "iFrame Embed",
  description: "Embed any URL in an iframe",
  category: "info",
  icon: <Globe size={14} />,
  defaultConfig: { url: "", scrolling: true },
  defaultSize: { w: GRID_SIZE * 14, h: GRID_SIZE * 12 },
  minSize: { w: GRID_SIZE * 2, h: GRID_SIZE * 2 },
  component: IframeWidget,
});
