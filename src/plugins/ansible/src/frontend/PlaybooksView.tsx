import { useCallback, useEffect, useState } from "react";
import { FileText, Play, ScrollText } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
} from "@termix-ssh/plugin-sdk/ui";
import type { AnsibleStatus, ProjectFile } from "../shared/types";
import { errorMessage, getFiles } from "./api";
import { formatSize, formatTime } from "./format";
import { Loading } from "./Loading";

/** Playbooks first, then the other files of the project. */
export function PlaybooksView({
  hostId,
  status,
  isVisible,
  onEdit,
  onRun,
}: {
  hostId: number;
  status: AnsibleStatus;
  isVisible: boolean;
  onEdit: (path: string) => void;
  onRun: (path: string) => void;
}) {
  const { t, language } = useTranslation();
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setFiles((await getFiles(hostId)).files);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("files.listFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (!status.projectExists) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
        {t("files.noProject", { dir: status.projectDir })}
      </p>
    );
  }

  const needle = search.trim().toLowerCase();
  const visible = (files ?? [])
    .filter((f) => !needle || f.path.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.playbook) - Number(a.playbook));

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("files.search")}
          className="min-w-48 flex-1"
        />
      </div>
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !files ? (
        <Loading />
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {files.length === 0 ? t("files.empty") : t("files.noMatch")}
        </p>
      ) : (
        <PanelList>
          {visible.map((file, index) => (
            <ListRow
              key={file.path}
              stripe={index}
              icon={
                file.playbook ? (
                  <ScrollText className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )
              }
              tone={file.playbook ? "brand" : "muted"}
              title={<span className="font-mono">{file.path}</span>}
              badges={
                file.playbook ? (
                  <ListBadge tone="brand">{t("files.playbook")}</ListBadge>
                ) : undefined
              }
              meta={`${formatSize(file.size)} | ${formatTime(file.modified, language)}`}
              onClick={() => onEdit(file.path)}
              actions={
                file.playbook && status.canEdit && status.installed ? (
                  <ListRowAction
                    label={t("files.run")}
                    tone="brand"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRun(file.path);
                    }}
                  >
                    <Play className="size-4" />
                  </ListRowAction>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
