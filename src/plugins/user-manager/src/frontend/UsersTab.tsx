import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  EmptyState,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type { UsersList, UsersStatus } from "../shared/types";
import { errorCode, errorMessage, getStatus, getUsers } from "./api";
import { GroupDetail } from "./GroupDetail";
import { GroupsView } from "./GroupsView";
import { Loading } from "./Loading";
import { SessionsView } from "./SessionsView";
import { UserCreate } from "./UserCreate";
import { UserDetail } from "./UserDetail";
import { UsersView } from "./UsersView";

type View = "users" | "groups" | "sessions";
type Screen =
  | { kind: "list" }
  | { kind: "user"; name: string }
  | { kind: "create" }
  | { kind: "group"; name: string };

/** Accounts, groups and sessions on one host. */
export function UsersTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<UsersStatus | null>(null);
  const [list, setList] = useState<UsersList | null>(null);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [view, setView] = useState<View>("users");
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === "disabled"
          ? t("tab.disabled")
          : errorMessage(e, t("tab.error")),
      );
      setLoading(false);
      return;
    }
    try {
      setList(await getUsers(hostId));
      setListError("");
    } catch (e) {
      setListError(errorMessage(e, t("users.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <Users className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <Loading />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const back = () => {
    setScreen({ kind: "list" });
    void load();
  };

  if (screen.kind === "user" && list) {
    const user = list.users.find((u) => u.name === screen.name);
    if (user) {
      return (
        <PanelFrame>
          <UserDetail
            key={user.name}
            hostId={hostId}
            status={status}
            user={user}
            groups={list.groups}
            onBack={back}
            reload={load}
          />
        </PanelFrame>
      );
    }
  }
  if (screen.kind === "create") {
    return (
      <PanelFrame>
        <UserCreate
          hostId={hostId}
          status={status}
          groups={list?.groups ?? []}
          onClose={back}
          onCreated={(name) => {
            void load();
            setScreen({ kind: "user", name });
          }}
        />
      </PanelFrame>
    );
  }
  if (screen.kind === "group" && list) {
    const group = list.groups.find((g) => g.name === screen.name);
    if (group) {
      return (
        <PanelFrame>
          <GroupDetail
            hostId={hostId}
            status={status}
            group={group}
            users={list.users}
            onBack={back}
            reload={load}
          />
        </PanelFrame>
      );
    }
  }

  const canEdit = status.canEdit && status.root;
  const statusLine = [
    status.os,
    list
      ? t("tab.counts", { count: list.users.filter((u) => !u.system).length })
      : "",
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void load();
                setTick((n) => n + 1);
              }}
              loading={loading}
              label={t("tab.refresh")}
            />
            {canEdit && status.tools && view === "users" && (
              <AddButton
                label={t("users.add")}
                onClick={() => setScreen({ kind: "create" })}
              />
            )}
            {canEdit && view === "groups" && (
              <AddButton
                label={t("groups.add")}
                onClick={() => setCreatingGroup(true)}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "users", label: t("tab.viewUsers") },
              { id: "groups", label: t("tab.viewGroups") },
              { id: "sessions", label: t("tab.viewSessions") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        <div className="flex shrink-0 flex-col">
          {status.canEdit && !status.root && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.sudo")}
            </Alert>
          )}
          {status.canEdit && status.root && !status.tools && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.noTools")}
            </Alert>
          )}
          {view === "sessions" ? (
            <SessionsView key={tick} hostId={hostId} isVisible={isVisible} />
          ) : listError ? (
            <p className="px-3 py-2 text-xs text-destructive">{listError}</p>
          ) : !list ? (
            <Loading />
          ) : view === "users" ? (
            <UsersView
              list={list}
              status={status}
              onOpen={(name) => setScreen({ kind: "user", name })}
            />
          ) : (
            <GroupsView
              hostId={hostId}
              list={list}
              creating={creatingGroup}
              onCreating={setCreatingGroup}
              onOpen={(name) => setScreen({ kind: "group", name })}
              reload={load}
            />
          )}
        </div>
      </PanelShell>
    </PanelFrame>
  );
}
