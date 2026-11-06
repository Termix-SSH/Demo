import { useState } from "react";
import { KeyRound, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
  ToolbarBand,
  GroupHeading,
} from "@termix-ssh/plugin-sdk/ui";
import type { KeyEntry, Reading } from "../shared/types";
import { errorMessage, revokeKey, rotateHostKeys, rotateLoginKey } from "./api";
import { shortPrint } from "./format";

const KINDS = ["authorized", "host", "private"] as const;

function weak(key: KeyEntry): boolean {
  return (
    key.type === "ssh-dss" ||
    (key.type === "ssh-rsa" && key.bits !== null && key.bits < 3072) ||
    key.unprotected
  );
}

/** Authorized keys, host keys and private keys found on the host. */
export function KeysView({
  hostId,
  reading,
  seenOn,
  canManage,
  onChanged,
}: {
  hostId: number;
  reading: Reading;
  seenOn: Record<string, number>;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState("");

  const run = async (id: string, work: () => Promise<string>) => {
    setBusy(id);
    try {
      toast.success(await work());
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy("");
    }
  };

  const rotateLogin = async () => {
    const ok = await confirm({
      title: t("keys.rotateTitle"),
      description: t("keys.rotateText"),
      confirmLabel: t("keys.rotate"),
      destructive: false,
    });
    if (ok) await run("login", () => rotateLoginKey(hostId));
  };

  const rotateHost = async () => {
    const ok = await confirm({
      title: t("keys.hostKeysTitle"),
      description: t("keys.hostKeysText"),
      confirmLabel: t("keys.hostKeys"),
    });
    if (ok) await run("host", () => rotateHostKeys(hostId));
  };

  const revoke = async (key: KeyEntry) => {
    const ok = await confirm({
      title: t("keys.revokeTitle"),
      description: t("keys.revokeText", {
        user: key.user,
        print: shortPrint(key.fingerprint),
      }),
      confirmLabel: t("keys.revoke"),
    });
    if (ok) {
      await run(key.id, () => revokeKey(hostId, key.path, key.fingerprint));
    }
  };

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <Button
          size="xs"
          variant="outline"
          disabled={!canManage || busy !== ""}
          onClick={() => void rotateLogin()}
        >
          <RefreshCw
            className={`size-3 ${busy === "login" ? "animate-spin" : ""}`}
          />
          {t("keys.rotate")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!canManage || busy !== ""}
          onClick={() => void rotateHost()}
        >
          <ShieldAlert className="size-3" />
          {t("keys.hostKeys")}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {t("keys.hint")}
        </span>
      </ToolbarBand>
      {reading.keys.length === 0 ? (
        <EmptyState icon={KeyRound} title={t("keys.empty")} />
      ) : (
        KINDS.map((kind) => {
          const list = reading.keys.filter((k) => k.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind}>
              <GroupHeading
                title={t(`keys.kind.${kind}`)}
                className="border-b border-border px-3 py-1.5"
              />
              <PanelList>
                {list.map((key, index) => (
                  <ListRow
                    key={key.id}
                    stripe={index}
                    tone={weak(key) ? "warning" : "none"}
                    icon={<KeyRound className="size-3.5" />}
                    title={
                      key.comment ||
                      (key.kind === "host" ? key.path : key.fingerprint)
                    }
                    meta={[
                      shortPrint(key.fingerprint),
                      key.user ? `${key.user}` : "",
                      key.path,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                    badges={
                      <>
                        <ListBadge tone={weak(key) ? "warning" : "muted"}>
                          {key.type.replace(/^ssh-/, "")}
                          {key.bits ? ` ${key.bits}` : ""}
                        </ListBadge>
                        {key.unprotected && (
                          <ListBadge tone="destructive">
                            {t("keys.noPassphrase")}
                          </ListBadge>
                        )}
                        {key.kind === "authorized" && key.known && (
                          <ListBadge tone="success">
                            {key.knownAs || t("keys.known")}
                          </ListBadge>
                        )}
                        {key.kind === "authorized" && !key.known && (
                          <ListBadge tone="muted">
                            {t("keys.unknown")}
                          </ListBadge>
                        )}
                        {key.restricted && (
                          <ListBadge tone="brand">
                            {t("keys.restricted")}
                          </ListBadge>
                        )}
                        {key.kind === "authorized" &&
                          (seenOn[key.fingerprint] ?? 0) > 0 && (
                            <ListBadge tone="muted">
                              {t("keys.alsoOn", {
                                count: seenOn[key.fingerprint],
                              })}
                            </ListBadge>
                          )}
                      </>
                    }
                    trailing={
                      key.kind === "authorized" ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          aria-label={t("keys.revoke")}
                          disabled={!canManage || busy !== ""}
                          onClick={() => void revoke(key)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </PanelList>
            </section>
          );
        })
      )}
    </div>
  );
}
