import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, StatusBadge } from "@termix-ssh/plugin-sdk/ui";
import type { FactsHost } from "../shared/types";
import { errorMessage, getFacts, getRun, startRun } from "./api";
import { TargetPicker } from "./TargetPicker";

const POLL_MS = 1500;

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

function ipv4(facts: Record<string, unknown>): string {
  const def = facts.ansible_default_ipv4 as { address?: string } | undefined;
  if (def?.address) return def.address;
  const all = facts.ansible_all_ipv4_addresses;
  return Array.isArray(all) ? text(all[0]) : "";
}

function uptime(seconds: unknown): string {
  const s = Number(seconds);
  if (!s) return "";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Gathers facts from the picked hosts and shows the useful ones. */
export function FactsView({ hostId }: { hostId: number }) {
  const { t } = useTranslation();
  const [hostIds, setHostIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FactsHost[] | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const gather = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const run = await startRun(hostId, { kind: "facts", hostIds });
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (!alive.current) return;
        const state = (await getRun(hostId, run.id)).state;
        if (state !== "running") break;
      }
      setResult(await getFacts(hostId, run.id));
    } catch (e) {
      setError(errorMessage(e, t("facts.failed")));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">{t("facts.hint")}</p>
      <TargetPicker hostId={hostId} selected={hostIds} onChange={setHostIds} />
      {error && (
        <p className="whitespace-pre-wrap text-xs text-destructive">{error}</p>
      )}
      <div>
        <Button
          onClick={() => void gather()}
          disabled={busy || hostIds.length === 0}
        >
          {busy ? t("facts.gathering") : t("facts.gather")}
        </Button>
      </div>
      {result &&
        (result.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("facts.none")}</p>
        ) : (
          <div className="overflow-auto border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  {[
                    "host",
                    "os",
                    "kernel",
                    "cpu",
                    "memory",
                    "address",
                    "uptime",
                  ].map((key) => (
                    <th key={key} className="px-3 py-1.5 font-medium">
                      {t(`facts.col.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.map((row) => (
                  <tr key={row.host} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{row.host}</td>
                    {row.ok ? (
                      <>
                        <td className="px-3 py-1.5">
                          {[
                            text(row.facts.ansible_distribution),
                            text(row.facts.ansible_distribution_version),
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        </td>
                        <td className="px-3 py-1.5">
                          {text(row.facts.ansible_kernel)}
                        </td>
                        <td className="px-3 py-1.5">
                          {text(row.facts.ansible_processor_vcpus)}
                        </td>
                        <td className="px-3 py-1.5">
                          {row.facts.ansible_memtotal_mb
                            ? `${text(row.facts.ansible_memtotal_mb)} MB`
                            : ""}
                        </td>
                        <td className="px-3 py-1.5">{ipv4(row.facts)}</td>
                        <td className="px-3 py-1.5">
                          {uptime(row.facts.ansible_uptime_seconds)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="px-3 py-1.5">
                        <StatusBadge tone="bad">
                          {t("facts.failedHost")}
                        </StatusBadge>{" "}
                        <span className="text-muted-foreground">
                          {row.message}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
