import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  LoadingState,
  ListRow,
  NoticePanel,
  PanelFrame,
  PanelList,
  PanelShell,
  RefreshButton,
  StatusBadge,
  TabStrip,
  getMyApiKeys,
  getSessions,
  getUserInfo,
  revokeAllMyApiKeys,
  revokeEveryoneSessions,
  revokeMyApiKey,
  revokeSession,
  useConfirm,
  type ApiKey,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

type Session = Awaited<ReturnType<typeof getSessions>>["sessions"][number];

interface Loaded {
  me: { userId: string; isAdmin: boolean };
  sessions: Session[];
  keys: ApiKey[];
}

function when(value: string | null | undefined, never: string): string {
  if (!value) return never;
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Every user's own sessions and API keys, with a way to end them all. */
export function SessionsKeysTab() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [view, setView] = useState<"sessions" | "keys">("sessions");
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [info, sessions, keys] = await Promise.all([
        getUserInfo(),
        getSessions(),
        getMyApiKeys(),
      ]);
      setData({
        me: { userId: info.userId, isAdmin: info.is_admin },
        // Admins get every session from the server; this page is your own.
        sessions: sessions.sessions.filter((s) => s.userId === info.userId),
        keys: keys.apiKeys,
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await load();
    } catch {
      toast.error(t("sessions.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function endOtherSessions() {
    if (!data) return;
    const others = data.sessions.filter((s) => !s.isCurrentSession);
    if (
      !(await confirm({
        title: t("sessions.endOthersConfirm", { count: others.length }),
        confirmLabel: t("sessions.endOthers"),
      }))
    ) {
      return;
    }
    await run(async () => {
      for (const session of others) await revokeSession(session.id);
    }, t("sessions.endedOthers"));
  }

  async function signOutEveryone() {
    if (
      !(await confirm({
        title: t("sessions.everyoneConfirm"),
        description: t("sessions.everyoneDescription"),
        confirmLabel: t("sessions.everyone"),
      }))
    ) {
      return;
    }
    const keys = await confirm({
      title: t("sessions.everyoneKeysConfirm"),
      confirmLabel: t("sessions.everyoneKeys"),
      cancelLabel: t("sessions.everyoneKeysNo"),
    });
    await run(
      () => revokeEveryoneSessions({ apiKeys: keys }),
      t("sessions.everyoneDone"),
    );
  }

  async function revokeAllKeys() {
    if (!data) return;
    if (
      !(await confirm({
        title: t("keys.revokeAllConfirm", { count: data.keys.length }),
        confirmLabel: t("keys.revokeAll"),
      }))
    ) {
      return;
    }
    await run(() => revokeAllMyApiKeys(), t("keys.revokedAll"));
  }

  let body;
  if (failed) {
    body = <NoticePanel tone="destructive" title={t("sessions.loadFailed")} />;
  } else if (!data) {
    body = <LoadingState />;
  } else if (view === "sessions") {
    body = (
      <PanelList empty={t("sessions.none")}>
        {data.sessions.map((session) => (
          <ListRow
            key={session.id}
            title={session.deviceInfo || session.deviceType}
            badges={
              session.isCurrentSession ? (
                <StatusBadge tone="ok">{t("sessions.current")}</StatusBadge>
              ) : undefined
            }
            meta={t("sessions.meta", {
              type: session.deviceType,
              lastActive: when(session.lastActiveAt, t("never")),
              created: when(session.createdAt, t("never")),
            })}
            trailing={
              session.isCurrentSession ? undefined : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => revokeSession(session.id),
                      t("sessions.ended"),
                    )
                  }
                >
                  {t("sessions.end")}
                </Button>
              )
            }
          />
        ))}
      </PanelList>
    );
  } else {
    body = (
      <PanelList empty={t("keys.none")}>
        {data.keys.map((key) => (
          <ListRow
            key={key.id}
            title={key.name}
            badges={
              <StatusBadge tone={key.scopes ? "info" : "warn"}>
                {key.scopes ? key.scopes.join(" | ") : t("keys.full")}
              </StatusBadge>
            }
            meta={t("keys.meta", {
              prefix: key.tokenPrefix,
              lastUsed: when(key.lastUsedAt, t("never")),
              expires: when(key.expiresAt, t("keys.noExpiry")),
            })}
            trailing={
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => revokeMyApiKey(key.id), t("keys.revoked"))
                }
              >
                {t("keys.revoke")}
              </Button>
            }
          />
        ))}
      </PanelList>
    );
  }

  const actions = data && (
    <>
      <RefreshButton onClick={() => void load()} loading={busy} />
      {view === "sessions" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || data.sessions.length < 2}
            onClick={() => void endOtherSessions()}
          >
            {t("sessions.endOthers")}
          </Button>
          {data.me.isAdmin && (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void signOutEveryone()}
            >
              {t("sessions.everyone")}
            </Button>
          )}
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || data.keys.length === 0}
          onClick={() => void revokeAllKeys()}
        >
          {t("keys.revokeAll")}
        </Button>
      )}
    </>
  );

  return (
    <PanelFrame>
      <PanelShell
        title={t("sessions.title")}
        actions={actions}
        tabs={
          <div className="shrink-0 border-b border-border px-1">
            <TabStrip
              tabs={[
                { id: "sessions", label: t("sessions.tab") },
                { id: "keys", label: t("keys.tab") },
              ]}
              activeTab={view}
              onTabChange={(id) => setView(id as "sessions" | "keys")}
            />
          </div>
        }
      >
        {body}
      </PanelShell>
    </PanelFrame>
  );
}
