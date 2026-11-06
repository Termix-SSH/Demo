import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  useSettings,
  useTabs,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import type { GitStatus, RepoInfo } from "../shared/types";
import { errorCode, errorMessage, getRepos, getStatus } from "./api";
import { RepoList } from "./RepoList";

/** Starting state of the panel, from the user's settings. */
export function useCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

type Handle = { getCwd?: () => Promise<string | null> };

/** The repo of the terminal's folder when it is added, else all repos. */
export function GitCompanion({ host, isVisible, getHandle }: CompanionProps) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const hostId = host ? Number(host.id) : 0;
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    if (!hostId) return;
    try {
      const [s, r] = await Promise.all([getStatus(hostId), getRepos(hostId)]);
      setStatus(s);
      setRepos(r);
      setFailed("");
      const handle = getHandle() as Handle | null;
      setCwd((await handle?.getCwd?.().catch(() => null)) ?? null);
    } catch (e) {
      setFailed(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
          : errorMessage(e, t("tab.error")),
      );
    }
  }, [hostId, getHandle, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const openTab = () => {
    if (host) tabs.openTab(host, "git");
  };

  // The repo whose folder holds the terminal's folder, deepest match first.
  const here = cwd
    ? [...(repos ?? [])]
        .sort((a, b) => b.path.length - a.path.length)
        .find((r) => cwd === r.path || cwd.startsWith(`${r.path}/`))
    : undefined;
  const shown = here ? [here] : (repos ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="flex items-center gap-1 p-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {here ? t("companion.here") : t("companion.all")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          title={t("tab.refresh")}
          aria-label={t("tab.refresh")}
          className="text-accent-brand"
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openTab}
          title={t("companion.openTab")}
          aria-label={t("companion.openTab")}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
      {failed ? (
        <p className="p-2 text-xs text-destructive">{failed}</p>
      ) : !repos || !status ? (
        <p className="p-2 text-xs text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : (
        <RepoList repos={shown} canEdit={false} compact onOpen={openTab} />
      )}
    </div>
  );
}
