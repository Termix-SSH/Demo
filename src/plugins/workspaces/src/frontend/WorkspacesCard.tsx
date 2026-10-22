import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Play } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Workspace } from "./types";
import { createWorkspacesApi } from "./workspaces-api";

const KEY = "newUi.sidebar.workspaces";

/** Dashboard card: saved workspaces, one click to open. */
export function WorkspacesCard({
  isVisible,
  shell,
  onApply,
}: DashboardCardProps & { onApply: (workspace: Workspace) => void }) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const client = usePluginApi();
  const api = useMemo(() => createWorkspacesApi(client), [client]);
  const confirm = useConfirm();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setWorkspaces(await api.list());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    if (isVisible && allowed) void load();
  }, [isVisible, allowed, load]);

  if (!allowed || failed || !workspaces) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {failed || !allowed ? t(`${KEY}.loadFailed`) : t("card.loading")}
      </p>
    );
  }

  const sorted = [...workspaces].sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      Number(a.kind === "last_session") - Number(b.kind === "last_session") ||
      a.name.localeCompare(b.name),
  );

  const apply = (workspace: Workspace) => {
    void confirm({
      title: t(`${KEY}.applyConfirmTitle`),
      description: t(`${KEY}.applyConfirmDescription`, {
        name: workspace.name,
      }),
      confirmLabel: t(`${KEY}.applyConfirmButton`),
    }).then((ok) => {
      if (ok) onApply(workspace);
    });
  };

  return (
    <PanelList
      empty={
        <button
          type="button"
          onClick={() => shell.openRailView("workspaces")}
          className="p-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {t(`${KEY}.noWorkspaces`)}
        </button>
      }
    >
      {sorted.map((workspace, index) => (
        <ListRow
          key={workspace.id}
          stripe={index}
          color={workspace.color ?? undefined}
          icon={<LayoutTemplate className="size-3.5" />}
          title={
            workspace.kind === "last_session"
              ? t("card.lastSession")
              : workspace.name
          }
          badges={
            workspace.isDefault ? (
              <ListBadge tone="brand">{t(`${KEY}.defaultBadge`)}</ListBadge>
            ) : undefined
          }
          meta={t(`${KEY}.tabCount`, { count: workspace.tabCount })}
          onClick={() => apply(workspace)}
          actions={
            <ListRowAction
              label={t(`${KEY}.apply`)}
              tone="brand"
              onClick={() => apply(workspace)}
            >
              <Play />
            </ListRowAction>
          }
        />
      ))}
    </PanelList>
  );
}
