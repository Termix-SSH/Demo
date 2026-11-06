import { useCallback, useEffect, useState } from "react";
import { Bug, Eye, EyeOff, ScanSearch } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  PanelList,
  Segmented,
  LoadingState,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { VulnScan, VulnSeverity } from "../shared/types";
import {
  errorMessage,
  getVulns,
  ignoreAdvisory,
  scanHost,
  unignoreAdvisory,
} from "./api";
import { severityTone, timeAgo } from "./format";

type Filter = "all" | VulnSeverity | "exploited" | "fixable";

const PAGE = 100;

/** Known vulnerabilities in the installed packages, from the last scan. */
export function VulnsView({
  hostId,
  isVisible,
  canEdit,
  scanEnabled,
  onChanged,
}: {
  hostId: number;
  isVisible: boolean;
  canEdit: boolean;
  scanEnabled: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [scan, setScan] = useState<VulnScan | null | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showIgnored, setShowIgnored] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const view = await getVulns(hostId);
      setScan(view.scan);
      setScanning(view.scanning);
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("vulns.error")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const scanNow = async () => {
    setScanning(true);
    try {
      const view = await scanHost(hostId);
      setScan(view.scan);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setScanning(false);
    }
  };

  const toggle = async (id: string, ignored: boolean) => {
    try {
      if (ignored) await unignoreAdvisory(hostId, id);
      else await ignoreAdvisory(hostId, id, "");
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    }
  };

  if (error) return <p className="p-3 text-xs text-destructive">{error}</p>;
  if (scan === undefined) {
    return <LoadingState label={t("common.loading")} />;
  }

  const header = (
    <ToolbarBand>
      <Button
        size="xs"
        variant="outline"
        disabled={!canEdit || scanning || !scanEnabled}
        onClick={() => void scanNow()}
      >
        <ScanSearch className={`size-3 ${scanning ? "animate-pulse" : ""}`} />
        {scanning ? t("vulns.scanning") : t("vulns.scan")}
      </Button>
      {scan && (
        <span className="text-[11px] text-muted-foreground">
          {t("vulns.summary", {
            packages: scan.packages,
            ecosystem: scan.ecosystem || "-",
            time: timeAgo(scan.at),
          })}
        </span>
      )}
    </ToolbarBand>
  );

  if (!scanEnabled) {
    return (
      <>
        {header}
        <EmptyState icon={Bug} title={t("vulns.off")} />
      </>
    );
  }
  if (!scan) {
    return (
      <>
        {header}
        <EmptyState icon={Bug} title={t("vulns.none")} />
      </>
    );
  }
  if (scan.unsupported) {
    return (
      <>
        {header}
        <EmptyState
          icon={Bug}
          title={t("vulns.unsupported", { os: scan.unsupported })}
        />
      </>
    );
  }

  const open = scan.vulns.filter((v) => !v.ignored);
  const pool = showIgnored ? scan.vulns : open;
  const matches = (v: VulnScan["vulns"][number], f: Filter) =>
    f === "all"
      ? true
      : f === "exploited"
        ? v.kev
        : f === "fixable"
          ? v.fixed !== ""
          : v.severity === f;
  const rows = pool.filter((v) => matches(v, filter));
  const count = (f: Filter) => open.filter((v) => matches(v, f)).length;
  const options: Array<{ value: Filter; label: string; count: number }> = (
    [
      "all",
      "exploited",
      "fixable",
      "critical",
      "high",
      "medium",
      "low",
      "unknown",
    ] as const
  ).map((f) => ({
    value: f,
    label: t(`vulns.filter.${f}`),
    count: count(f),
  }));

  return (
    <div className="flex flex-col">
      {header}
      {scan.error && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">
          {t("vulns.failed", { error: scan.error })}
        </p>
      )}
      {scan.pending > 0 && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("vulns.pending", { count: scan.pending })}
        </p>
      )}
      {!scan.kevChecked && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("vulns.noKev")}
        </p>
      )}
      <ToolbarBand>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={options}
        />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setShowIgnored((v) => !v)}
        >
          {showIgnored ? (
            <EyeOff className="size-3" />
          ) : (
            <Eye className="size-3" />
          )}
          {showIgnored ? t("vulns.hideIgnored") : t("vulns.showIgnored")}
        </Button>
      </ToolbarBand>
      {rows.length === 0 ? (
        <EmptyState icon={Bug} title={t("vulns.clean")} />
      ) : (
        <PanelList>
          {rows.slice(0, limit).map((v, index) => (
            <ListRow
              key={`${v.id}|${v.package}`}
              stripe={index}
              dimmed={v.ignored}
              tone={v.kev ? "destructive" : severityTone(v.severity)}
              icon={<Bug className="size-3.5" />}
              title={`${v.id} | ${v.package} ${v.version}`}
              meta={[
                v.summary,
                v.fixed
                  ? t("vulns.fixedIn", { version: v.fixed })
                  : t("vulns.noFix"),
                v.cves.length && v.cves[0] !== v.id
                  ? v.cves.slice(0, 3).join(", ")
                  : "",
              ]
                .filter(Boolean)
                .join(" | ")}
              badges={
                <>
                  {v.kev && (
                    <ListBadge tone="destructive">
                      {t("vulns.exploited")}
                    </ListBadge>
                  )}
                  <ListBadge tone={severityTone(v.severity)}>
                    {t(`vulns.sev.${v.severity}`)}
                    {v.score !== null ? ` ${v.score.toFixed(1)}` : ""}
                  </ListBadge>
                  {v.ignored && (
                    <ListBadge tone="muted">{t("vulns.ignored")}</ListBadge>
                  )}
                </>
              }
              trailing={
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!canEdit}
                  onClick={() => void toggle(v.id, v.ignored)}
                >
                  {v.ignored ? t("vulns.unignore") : t("vulns.ignore")}
                </Button>
              }
            />
          ))}
        </PanelList>
      )}
      {rows.length > limit && (
        <div className="border-t border-border p-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setLimit((n) => n + PAGE)}
          >
            {t("vulns.more", { count: rows.length - limit })}
          </Button>
        </div>
      )}
    </div>
  );
}
