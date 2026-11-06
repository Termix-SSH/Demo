import { useEffect, useState } from "react";
import { Boxes, Database, FolderOpen, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  FieldPair,
  ListRowAction,
  SecretField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextField,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  DatabaseLoginOption,
  DbEngine,
  DockerInventory,
  JobSourceInput,
} from "../shared/types";
import { errorMessage, getDocker } from "./api";
import { LinesField } from "./LinesField";

export function newSource(kind: JobSourceInput["kind"]): JobSourceInput {
  const id = Math.random().toString(36).slice(2, 10);
  if (kind === "paths") return { id, kind, paths: [], excludes: [] };
  if (kind === "docker") {
    return { id, kind, volumes: [], stacks: [], stop: false };
  }
  return {
    id,
    kind,
    engine: "mysql",
    loginId: 0,
    address: "",
    port: null,
    username: "",
    hasPassword: false,
    runAs: "",
    databases: [],
    password: "",
  };
}

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

function Check({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 py-1 text-xs">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span className="truncate">{label}</span>
      {detail && (
        <span className="truncate text-muted-foreground">{detail}</span>
      )}
    </label>
  );
}

function DockerFields({
  hostId,
  source,
  onChange,
}: {
  hostId: number;
  source: Extract<JobSourceInput, { kind: "docker" }>;
  onChange: (next: JobSourceInput) => void;
}) {
  const { t } = useTranslation();
  const [inventory, setInventory] = useState<DockerInventory | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      setInventory(await getDocker(hostId));
    } catch (e) {
      setError(errorMessage(e, t("sources.dockerFailed")));
    }
  };

  useEffect(() => {
    void load();
    // Loaded once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  // Names saved earlier stay pickable even when Docker no longer lists them.
  const volumes = [
    ...(inventory?.volumes ?? []),
    ...source.volumes
      .filter((name) => !inventory?.volumes.some((v) => v.name === name))
      .map((name) => ({ name, mountpoint: "" })),
  ];
  const stacks = [
    ...(inventory?.stacks ?? []),
    ...source.stacks
      .filter((name) => !inventory?.stacks.some((s) => s.name === name))
      .map((name) => ({ name, status: "", dir: "" })),
  ];

  return (
    <div className="flex flex-col gap-3 py-2">
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          {error}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {!inventory && !error && (
        <LoadingState compact label={t("common.loading")} />
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("sources.stacks")}
          </p>
          {stacks.length === 0 && inventory && (
            <p className="text-xs text-muted-foreground">
              {t("sources.noStacks")}
            </p>
          )}
          {stacks.map((stack) => (
            <Check
              key={stack.name}
              label={stack.name}
              detail={stack.dir}
              checked={source.stacks.includes(stack.name)}
              onChange={(on) =>
                onChange({
                  ...source,
                  stacks: toggle(source.stacks, stack.name, on),
                })
              }
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("sources.volumes")}
          </p>
          {volumes.length === 0 && inventory && (
            <p className="text-xs text-muted-foreground">
              {t("sources.noVolumes")}
            </p>
          )}
          {volumes.map((volume) => (
            <Check
              key={volume.name}
              label={volume.name}
              checked={source.volumes.includes(volume.name)}
              onChange={(on) =>
                onChange({
                  ...source,
                  volumes: toggle(source.volumes, volume.name, on),
                })
              }
            />
          ))}
        </div>
      </div>
      <SwitchRow
        label={t("sources.stop")}
        description={t("sources.stopHint")}
        checked={source.stop}
        onChange={(stop) => onChange({ ...source, stop })}
      />
    </div>
  );
}

function DatabaseFields({
  source,
  logins,
  onChange,
}: {
  source: Extract<JobSourceInput, { kind: "database" }>;
  logins: DatabaseLoginOption[] | null;
  onChange: (next: JobSourceInput) => void;
}) {
  const { t } = useTranslation();
  const saved = (logins ?? []).filter((l) => l.engine === source.engine);
  const own = source.loginId === 0 || source.engine === "sqlite";
  const set = (patch: Partial<typeof source>) =>
    onChange({ ...source, ...patch });

  return (
    <div className="flex flex-col gap-3 py-2">
      <FieldPair>
        <SelectField<DbEngine>
          label={t("sources.engine")}
          value={source.engine}
          onChange={(engine) => set({ engine, loginId: 0, databases: [] })}
          options={[
            { value: "mysql", label: t("sources.engines.mysql") },
            { value: "postgres", label: t("sources.engines.postgres") },
            { value: "sqlite", label: t("sources.engines.sqlite") },
          ]}
        />
        {source.engine !== "sqlite" && (
          <SelectField
            label={t("sources.login")}
            value={String(source.loginId)}
            onChange={(value) => set({ loginId: Number(value) })}
            hint={logins === null ? t("sources.noDatabasesPlugin") : undefined}
            options={[
              { value: "0", label: t("sources.ownLogin") },
              ...saved.map((login) => ({
                value: String(login.id),
                label: login.database
                  ? `${login.name} | ${login.database}`
                  : login.name,
              })),
            ]}
          />
        )}
      </FieldPair>
      {own && source.engine !== "sqlite" && (
        <>
          <FieldPair>
            <TextField
              label={t("sources.address")}
              value={source.address}
              placeholder={t("sources.addressPlaceholder")}
              onChange={(address) => set({ address })}
            />
            <TextField
              label={t("sources.port")}
              value={source.port ? String(source.port) : ""}
              placeholder={source.engine === "mysql" ? "3306" : "5432"}
              onChange={(value) =>
                set({ port: value.trim() ? Number(value) || null : null })
              }
            />
          </FieldPair>
          <FieldPair>
            <TextField
              label={t("sources.username")}
              value={source.username}
              onChange={(username) => set({ username })}
            />
            <SecretField
              label={t("sources.password")}
              value={source.password ?? ""}
              placeholder={
                source.hasPassword ? t("sources.passwordSaved") : undefined
              }
              onChange={(password) => set({ password })}
            />
          </FieldPair>
          <TextField
            label={t("sources.runAs")}
            value={source.runAs}
            placeholder={source.engine === "postgres" ? "postgres" : ""}
            hint={t("sources.runAsHint")}
            onChange={(runAs) => set({ runAs })}
          />
        </>
      )}
      <LinesField
        key={source.engine}
        label={
          source.engine === "sqlite"
            ? t("sources.sqliteFiles")
            : t("sources.databases")
        }
        hint={
          source.engine === "sqlite"
            ? t("sources.sqliteFilesHint")
            : t("sources.databasesHint")
        }
        placeholder={source.engine === "sqlite" ? "/srv/app/data.db" : ""}
        lines={source.databases}
        onChange={(databases) => set({ databases })}
      />
    </div>
  );
}

export function SourceCard({
  hostId,
  source,
  logins,
  onChange,
  onRemove,
}: {
  hostId: number;
  source: JobSourceInput;
  logins: DatabaseLoginOption[] | null;
  onChange: (next: JobSourceInput) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const remove = (
    <ListRowAction
      label={t("sources.remove")}
      tone="destructive"
      onClick={onRemove}
    >
      <Trash2 />
    </ListRowAction>
  );

  if (source.kind === "paths") {
    return (
      <SectionCard
        title={t("sources.paths")}
        icon={<FolderOpen />}
        action={remove}
      >
        <div className="grid grid-cols-1 gap-3 py-2 md:grid-cols-2">
          <LinesField
            label={t("sources.folders")}
            hint={t("sources.foldersHint")}
            placeholder={"/etc\n/home"}
            lines={source.paths}
            rows={4}
            onChange={(paths) => onChange({ ...source, paths })}
          />
          <LinesField
            label={t("sources.excludes")}
            hint={t("sources.excludesHint")}
            placeholder={"*.tmp\n/home/*/.cache"}
            lines={source.excludes}
            rows={4}
            onChange={(excludes) => onChange({ ...source, excludes })}
          />
        </div>
      </SectionCard>
    );
  }
  if (source.kind === "docker") {
    return (
      <SectionCard title={t("sources.docker")} icon={<Boxes />} action={remove}>
        <DockerFields hostId={hostId} source={source} onChange={onChange} />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title={t("sources.database")}
      icon={<Database />}
      action={remove}
    >
      <DatabaseFields source={source} logins={logins} onChange={onChange} />
    </SectionCard>
  );
}
