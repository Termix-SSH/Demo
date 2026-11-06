import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, LoadingState, Sparkline } from "@termix-ssh/plugin-sdk/ui";
import type { BucketRow, UsagePoint } from "../shared/types";
import { errorMessage, type Api } from "./api";
import { formatBytes, formatDate, limitTone } from "./format";

export function UsagePanel({
  api,
  accountId,
  bucket,
  row,
  canScan,
  onScanned,
}: {
  api: Api;
  accountId: number;
  bucket: string;
  row: BucketRow | null;
  canScan: boolean;
  onScanned: () => void;
}) {
  const { t } = useTranslation();
  const [points, setPoints] = useState<UsagePoint[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      setPoints(await api.usage(accountId, bucket));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [api, accountId, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  async function scan() {
    setScanning(true);
    try {
      await api.scan(accountId, bucket);
      await load();
      onScanned();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setScanning(false);
    }
  }

  if (!points) return <LoadingState />;
  const last = points[points.length - 1];
  const percent =
    row?.maxBytes && last
      ? Math.round((last.bytes / row.maxBytes) * 100)
      : null;

  return (
    <div className="space-y-4 p-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {last ? formatBytes(last.bytes) : "-"}
          </div>
          <div className="text-xs text-muted-foreground">
            {last
              ? t("usage.objects", { count: last.objects })
              : t("usage.none")}
            {row?.partial ? ` | ${t("usage.partial")}` : ""}
          </div>
        </div>
        {percent !== null && (
          <div
            className={
              limitTone(percent) === "bad"
                ? "text-destructive"
                : limitTone(percent) === "warn"
                  ? "text-amber-500"
                  : "text-muted-foreground"
            }
          >
            {t("usage.ofLimit", { percent })}
          </div>
        )}
        <div className="flex-1" />
        {canScan && (
          <Button
            size="sm"
            variant="outline"
            disabled={scanning}
            onClick={() => void scan()}
          >
            {t(scanning ? "usage.scanning" : "usage.scan")}
          </Button>
        )}
      </div>
      {points.length > 1 && (
        <div className="h-24">
          <Sparkline data={points.map((point) => point.bytes)} />
        </div>
      )}
      <ul className="divide-y divide-border border-y border-border text-xs">
        {[...points].reverse().map((point) => (
          <li key={point.day} className="flex gap-4 px-1 py-1.5">
            <span className="w-28">{point.day}</span>
            <span className="w-24 tabular-nums">
              {formatBytes(point.bytes)}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {t("usage.objects", { count: point.objects })}
            </span>
          </li>
        ))}
      </ul>
      {row?.scannedAt && (
        <p className="text-xs text-muted-foreground">
          {t("usage.last", { when: formatDate(row.scannedAt) })}
        </p>
      )}
    </div>
  );
}
