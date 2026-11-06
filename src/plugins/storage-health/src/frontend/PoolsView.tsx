import { useState } from "react";
import { Layers, Play, Square } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Reading } from "../shared/types";
import { errorMessage, scrub } from "./api";
import { formatBytes, rowTone } from "./format";

interface Item {
  id: string;
  kind: string;
  title: string;
  meta: string;
  health: "ok" | "warn" | "fail" | "unknown";
  badge: string;
  running: boolean;
  canScrub: boolean;
}

function itemsOf(reading: Reading): Item[] {
  return [
    ...reading.pools.map<Item>((p) => ({
      id: p.id,
      kind: "ZFS",
      title: p.name,
      meta: [
        formatBytes(p.sizeBytes),
        p.usedPct !== null ? `${p.usedPct}%` : "",
        p.scan,
        p.errors ? `${p.errors} errors` : "",
      ]
        .filter((x) => x && x !== "-")
        .join(" | "),
      health: p.health,
      badge: p.state,
      running: p.scrubbing,
      canScrub: true,
    })),
    ...reading.arrays.map<Item>((a) => ({
      id: a.id,
      kind: a.level ? a.level.toUpperCase() : "MD",
      title: a.name,
      meta: [
        `${a.active}/${a.total}`,
        a.failed.length ? `failed: ${a.failed.join(", ")}` : "",
        a.syncAction
          ? `${a.syncAction}${a.syncPct !== null ? ` ${a.syncPct}%` : ""}${a.syncEta ? `, ${a.syncEta}` : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" | "),
      health: a.health,
      badge: a.state,
      running: a.syncAction !== "",
      canScrub: a.state !== "inactive",
    })),
    ...reading.btrfs.map<Item>((b) => ({
      id: b.id,
      kind: "btrfs",
      title: b.label ? `${b.mount} (${b.label})` : b.mount,
      meta: [b.scrub, b.errors ? `${b.errors} errors` : ""]
        .filter(Boolean)
        .join(" | "),
      health: b.health,
      badge: b.errors ? "errors" : "ok",
      running: b.scrubbing,
      canScrub: true,
    })),
  ];
}

/** ZFS pools, mdadm arrays, btrfs filesystems and LVM thin pools. */
export function PoolsView({
  hostId,
  reading,
  canEdit,
  onChanged,
}: {
  hostId: number;
  reading: Reading;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState("");
  const items = itemsOf(reading);
  const thin = reading.groups.flatMap((g) =>
    g.thin.map((x) => ({ group: g, pool: x })),
  );

  const toggle = async (item: Item) => {
    const stop = item.running;
    if (!stop) {
      const ok = await confirm({
        title: t("pools.startTitle", { name: item.title }),
        description: t("pools.startText"),
        confirmLabel: t("pools.start"),
      });
      if (!ok) return;
    }
    setBusy(item.id);
    try {
      toast.success(await scrub(hostId, item.id, stop));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy("");
    }
  };

  if (!items.length && !thin.length) {
    return <EmptyState icon={Layers} title={t("pools.empty")} />;
  }
  return (
    <PanelList>
      {items.map((item, index) => (
        <ListRow
          key={item.id}
          stripe={index}
          tone={rowTone(item.health)}
          icon={<Layers className="size-3.5" />}
          title={item.title}
          meta={item.meta}
          badges={
            <>
              <ListBadge tone="muted">{item.kind}</ListBadge>
              <ListBadge tone={rowTone(item.health)}>{item.badge}</ListBadge>
            </>
          }
          trailing={
            item.canScrub ? (
              <Button
                size="xs"
                variant="outline"
                disabled={!canEdit || busy !== ""}
                onClick={() => void toggle(item)}
              >
                {item.running ? (
                  <Square className="size-3" />
                ) : (
                  <Play className="size-3" />
                )}
                {item.running ? t("pools.stop") : t("pools.scrub")}
              </Button>
            ) : undefined
          }
        />
      ))}
      {thin.map(({ group, pool }, index) => (
        <ListRow
          key={`${group.id}/${pool.name}`}
          stripe={items.length + index}
          tone={rowTone(group.health)}
          icon={<Layers className="size-3.5" />}
          title={`${group.name}/${pool.name}`}
          meta={t("pools.thinMeta", {
            data: pool.dataPct ?? "-",
            meta: pool.metaPct ?? "-",
            free: formatBytes(group.freeBytes),
          })}
          badges={
            <>
              <ListBadge tone="muted">LVM thin</ListBadge>
              <ListBadge tone={rowTone(group.health)}>
                {pool.dataPct === null ? "-" : `${Math.round(pool.dataPct)}%`}
              </ListBadge>
            </>
          }
        />
      ))}
    </PanelList>
  );
}
