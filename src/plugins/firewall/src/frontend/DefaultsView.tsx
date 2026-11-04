import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FieldPair,
  ListBadge,
  ListRow,
  PanelList,
  SelectField,
} from "@termix-ssh/plugin-sdk/ui";
import type { Defaults, FirewallStatus, Policy } from "../shared/types";
import { setDefaultZone, setDefaults, setZoneTarget } from "./api";
import type { useChange } from "./useChange";

const TARGETS = ["default", "ACCEPT", "DROP", "%%REJECT%%"] as const;

export function DefaultsView({
  hostId,
  status,
  change,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
}) {
  const canEdit = status.canEdit && !status.pending && status.active;
  if (status.backend === "firewalld")
    return (
      <ZonesView
        hostId={hostId}
        status={status}
        change={change}
        canEdit={canEdit}
      />
    );

  return (
    <PolicyForm
      hostId={hostId}
      status={status}
      change={change}
      canEdit={status.canEdit && !status.pending}
    />
  );
}

function PolicyForm({
  hostId,
  status,
  change,
  canEdit,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const start: Defaults = status.defaults ?? {
    incoming: "deny",
    outgoing: "allow",
  };
  const [value, setValue] = useState<Defaults>(start);
  const policies = (["allow", "deny", "reject"] as Policy[]).map((p) => ({
    value: p,
    label: t(`policies.${p}`),
  }));
  const dirty =
    value.incoming !== start.incoming ||
    value.outgoing !== start.outgoing ||
    (value.routed ?? "") !== (start.routed ?? "");

  const save = () => {
    const changed: Partial<Defaults> = {};
    if (value.incoming !== start.incoming) changed.incoming = value.incoming;
    if (value.outgoing !== start.outgoing) changed.outgoing = value.outgoing;
    if (value.routed && value.routed !== start.routed)
      changed.routed = value.routed;
    void change.run(
      (force) => setDefaults(hostId, { ...changed, force }),
      t("defaults.saved"),
    );
  };

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("defaults.hint")}</p>
      <FieldPair>
        <SelectField
          label={t("defaults.incoming")}
          value={value.incoming}
          onChange={(v) => setValue({ ...value, incoming: v })}
          options={policies}
          disabled={!canEdit}
        />
        <SelectField
          label={t("defaults.outgoing")}
          value={value.outgoing}
          onChange={(v) => setValue({ ...value, outgoing: v })}
          options={policies}
          disabled={!canEdit}
        />
      </FieldPair>
      {status.backend === "ufw" && value.routed && (
        <SelectField
          label={t("defaults.routed")}
          value={value.routed}
          onChange={(v) => setValue({ ...value, routed: v })}
          options={policies}
          disabled={!canEdit}
        />
      )}
      {canEdit && (
        <div>
          <Button size="sm" disabled={!dirty || change.busy} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ZonesView({
  hostId,
  status,
  change,
  canEdit,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [main, setMain] = useState(status.defaultZone);
  const shown = status.zones.filter((z) => z.active || z.isDefault);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("zones.hint")}</p>
      <div className="flex max-w-2xl items-end gap-2">
        <SelectField
          label={t("zones.defaultZone")}
          value={main}
          onChange={setMain}
          options={status.zones.map((z) => ({ value: z.name, label: z.name }))}
          disabled={!canEdit}
          className="flex-1"
        />
        {canEdit && (
          <Button
            size="sm"
            disabled={main === status.defaultZone || change.busy}
            onClick={() =>
              void change.run(
                (force) => setDefaultZone(hostId, main, force),
                t("zones.saved"),
              )
            }
          >
            {t("common.save")}
          </Button>
        )}
      </div>
      <PanelList>
        {shown.map((zone, index) => (
          <ListRow
            key={zone.name}
            stripe={index}
            title={<span className="font-mono text-xs">{zone.name}</span>}
            meta={
              [
                zone.interfaces.length
                  ? t("zones.interfaces", { list: zone.interfaces.join(", ") })
                  : "",
                zone.sources.length
                  ? t("zones.sources", { list: zone.sources.join(", ") })
                  : "",
              ]
                .filter(Boolean)
                .join(" | ") || undefined
            }
            badges={
              <>
                {zone.isDefault && (
                  <ListBadge tone="brand">{t("zones.default")}</ListBadge>
                )}
                {zone.active && (
                  <ListBadge tone="success">{t("zones.active")}</ListBadge>
                )}
              </>
            }
            trailing={
              <div className="w-44">
                <SelectField
                  label={t("zones.target")}
                  value={zone.target}
                  onChange={(target) =>
                    void change.run(
                      (force) =>
                        setZoneTarget(hostId, zone.name, target, force),
                      t("zones.saved"),
                    )
                  }
                  options={[...new Set<string>([...TARGETS, zone.target])].map(
                    (target) => ({
                      value: target,
                      label: t(`zones.targets.${target.replace(/%/g, "")}`, {
                        defaultValue: target,
                      }),
                    }),
                  )}
                  disabled={!canEdit || change.busy}
                />
              </div>
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
