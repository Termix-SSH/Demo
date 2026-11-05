import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, FormFooter } from "@termix-ssh/plugin-sdk/ui";
import type { ClientConfig } from "../shared/types";

/** A QR code drawn as one SVG path. */
function Qr({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    try {
      const qr = qrcode(0, "L");
      qr.addData(text);
      qr.make();
      const size = qr.getModuleCount();
      let d = "";
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
        }
      }
      return { d, size: size + 8 };
    } catch {
      return null;
    }
  }, [text]);
  if (!path) return null;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${path.size} ${path.size}`}
      className="size-56 shrink-0 bg-white"
      shapeRendering="crispEdges"
    >
      <path d={path.d} fill="#000" />
    </svg>
  );
}

/** The client config as text, a QR code and a download. */
export function ClientConfigView({
  config,
  onBack,
}: {
  config: ClientConfig;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config.config);
      toast.success(t("clientConfig.copied"));
    } catch {
      toast.error(t("clientConfig.copyFailed"));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([config.config], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${config.name}.conf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">{config.name}</p>
      <p className="text-xs text-muted-foreground">{t("clientConfig.note")}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Qr text={config.config} label={t("clientConfig.qr")} />
        <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all border border-border p-2 font-mono text-xs">
          {config.config}
        </pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copy()}>
          {t("clientConfig.copy")}
        </Button>
        <Button variant="outline" onClick={download}>
          {t("clientConfig.download")}
        </Button>
      </div>
      <FormFooter onCancel={onBack} cancelLabel={t("common.back")} />
    </div>
  );
}
