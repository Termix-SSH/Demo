import { useState } from "react";
import { Copy, Eye, HardDrive, KeyRound, PlugZap } from "lucide-react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FieldPair,
  FormFooter,
  InlineView,
  SecretField,
  SectionCard,
  SelectField,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import {
  REPO_KINDS,
  type RepoKind,
  type RepoLocation,
  type RepositoryView,
} from "../shared/types";
import {
  createRepository,
  deleteRepository,
  errorMessage,
  installRclone,
  revealPassword,
  testRepository,
  updateRepository,
} from "./api";

/** Add or change a storage place for backups. */
export function RepoEditor({
  repo,
  onClose,
  onSaved,
}: {
  repo: RepositoryView | null;
  onClose: () => void;
  onSaved: (repo: RepositoryView | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { hosts } = useHosts();
  const [current, setCurrent] = useState<RepositoryView | null>(repo);
  const [name, setName] = useState(repo?.name ?? "");
  const [kind, setKind] = useState<RepoKind>(repo?.kind ?? "s3");
  const [location, setLocation] = useState<RepoLocation>(repo?.location ?? {});
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [checkHost, setCheckHost] = useState<number>(
    repo?.location.hostId ?? Number(hosts[0]?.id ?? 0),
  );
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string>("");

  const loc = (patch: Partial<RepoLocation>) =>
    setLocation((l) => ({ ...l, ...patch }));
  const hostOptions = hosts.map((h) => ({
    value: String(h.id),
    label: h.name || h.ip || `#${h.id}`,
  }));
  const sameKind = current?.kind === kind;
  const needsSecret =
    (kind === "s3" || kind === "rclone") && !(sameKind && current?.hasSecret);

  const canSave =
    !saving &&
    !!name.trim() &&
    (!needsSecret || !!secret.trim()) &&
    (kind !== "local" || (!!location.hostId && !!location.path?.trim()));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    const body = {
      name,
      kind,
      location:
        kind === "local"
          ? { hostId: location.hostId, path: location.path }
          : kind === "s3"
            ? {
                endpoint: location.endpoint,
                bucket: location.bucket,
                prefix: location.prefix,
                region: location.region,
                accessKeyId: location.accessKeyId,
              }
            : kind === "rest"
              ? { url: location.url, username: location.username }
              : { remote: location.remote, path: location.path },
      secret,
      password,
    };
    try {
      const saved = current
        ? await updateRepository(current.id, body)
        : await createRepository(body);
      toast.success(t("repos.saved"));
      setCurrent(saved);
      setSecret("");
      setPassword("");
      if (!current) {
        toast.info(t("repos.checkNext"));
      } else {
        onSaved(saved);
      }
    } catch (e) {
      setError(errorMessage(e, t("repos.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current) return;
    const ok = await confirm({
      title: t("repos.deleteTitle", { name: current.name }),
      description: t("repos.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await deleteRepository(current.id);
      toast.success(t("repos.deleted"));
      onSaved(null);
    } catch (e) {
      toast.error(errorMessage(e, t("repos.deleteFailed")));
    }
  }

  async function check(init: boolean) {
    if (!current) return;
    setChecking(true);
    setCheckResult("");
    try {
      const res = await testRepository(current.id, checkHost, init);
      setCheckResult(
        res.created
          ? t("repos.created")
          : res.ok
            ? t("repos.opened")
            : (res.error ?? t("repos.checkFailed")),
      );
    } catch (e) {
      setCheckResult(errorMessage(e, t("repos.checkFailed")));
    } finally {
      setChecking(false);
    }
  }

  async function addRclone() {
    setChecking(true);
    setCheckResult("");
    try {
      const version = await installRclone(checkHost);
      setCheckResult(t("repos.rcloneInstalled", { version }));
    } catch (e) {
      setCheckResult(errorMessage(e, t("repos.rcloneFailed")));
    } finally {
      setChecking(false);
    }
  }

  async function reveal() {
    if (!current) return;
    const ok = await confirm({
      title: t("repos.revealTitle"),
      description: t("repos.revealDesc"),
      confirmLabel: t("repos.reveal"),
      destructive: false,
    });
    if (!ok) return;
    try {
      setShown(await revealPassword(current.id));
    } catch (e) {
      toast.error(errorMessage(e, t("repos.revealFailed")));
    }
  }

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) =>
        !open && (current && !repo ? onSaved(current) : onClose())
      }
      icon={<HardDrive className="size-4" />}
      title={current ? current.name : t("repos.newTitle")}
      footer={
        <FormFooter
          onCancel={() => (current && !repo ? onSaved(current) : onClose())}
          onSave={() => void save()}
          saving={saving}
          disabled={!canSave}
          saveLabel={t("common.save")}
          cancelLabel={current && !repo ? t("common.done") : t("common.cancel")}
          onDelete={current ? () => void remove() : undefined}
          deleteLabel={t("common.delete")}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
        />
      }
    >
      <SectionCard title={t("repos.storage")} icon={<HardDrive />}>
        <div className="flex flex-col gap-3 py-2">
          <FieldPair>
            <TextField
              label={t("repos.name")}
              value={name}
              placeholder={t("repos.namePlaceholder")}
              onChange={setName}
            />
            <SelectField<RepoKind>
              label={t("repos.kind")}
              value={kind}
              onChange={(value) => {
                setKind(value);
                setSecret("");
              }}
              options={REPO_KINDS.map((value) => ({
                value,
                label: t(`repos.kinds.${value}`),
              }))}
            />
          </FieldPair>
          {kind === "s3" && (
            <>
              <FieldPair>
                <TextField
                  label={t("repos.endpoint")}
                  value={location.endpoint ?? ""}
                  placeholder="https://s3.amazonaws.com"
                  hint={t("repos.endpointHint")}
                  onChange={(endpoint) => loc({ endpoint })}
                />
                <TextField
                  label={t("repos.region")}
                  value={location.region ?? ""}
                  placeholder="us-east-1"
                  onChange={(region) => loc({ region })}
                />
              </FieldPair>
              <FieldPair>
                <TextField
                  label={t("repos.bucket")}
                  value={location.bucket ?? ""}
                  onChange={(bucket) => loc({ bucket })}
                />
                <TextField
                  label={t("repos.prefix")}
                  value={location.prefix ?? ""}
                  placeholder="termix"
                  hint={t("repos.prefixHint")}
                  onChange={(prefix) => loc({ prefix })}
                />
              </FieldPair>
              <FieldPair>
                <TextField
                  label={t("repos.accessKeyId")}
                  value={location.accessKeyId ?? ""}
                  mono
                  onChange={(accessKeyId) => loc({ accessKeyId })}
                />
                <SecretField
                  label={t("repos.secretKey")}
                  value={secret}
                  placeholder={
                    sameKind && current?.hasSecret
                      ? t("repos.secretSaved")
                      : undefined
                  }
                  onChange={setSecret}
                />
              </FieldPair>
            </>
          )}
          {kind === "rest" && (
            <>
              <TextField
                label={t("repos.url")}
                value={location.url ?? ""}
                placeholder="https://backup.example.com:8000/myhost"
                mono
                onChange={(url) => loc({ url })}
              />
              <FieldPair>
                <TextField
                  label={t("repos.username")}
                  value={location.username ?? ""}
                  hint={t("repos.usernameHint")}
                  onChange={(username) => loc({ username })}
                />
                <SecretField
                  label={t("repos.restPassword")}
                  value={secret}
                  placeholder={
                    sameKind && current?.hasSecret
                      ? t("repos.secretSaved")
                      : undefined
                  }
                  onChange={setSecret}
                />
              </FieldPair>
            </>
          )}
          {kind === "rclone" && (
            <>
              <FieldPair>
                <TextField
                  label={t("repos.remote")}
                  value={location.remote ?? ""}
                  placeholder="gdrive"
                  hint={t("repos.remoteHint")}
                  onChange={(remote) => loc({ remote })}
                />
                <TextField
                  label={t("repos.path")}
                  value={location.path ?? ""}
                  placeholder="backups/termix"
                  onChange={(path) => loc({ path })}
                />
              </FieldPair>
              <TextAreaField
                label={t("repos.rcloneConfig")}
                value={secret}
                rows={6}
                mono
                placeholder={
                  sameKind && current?.hasSecret
                    ? t("repos.rcloneSaved")
                    : "type = drive\nscope = drive\ntoken = {...}"
                }
                hint={t("repos.rcloneHint")}
                onChange={setSecret}
              />
            </>
          )}
          {kind === "local" && (
            <FieldPair>
              <SelectField
                label={t("repos.host")}
                value={location.hostId ? String(location.hostId) : ""}
                placeholder={t("repos.pickHost")}
                onChange={(value) => loc({ hostId: Number(value) })}
                options={hostOptions}
              />
              <TextField
                label={t("repos.folder")}
                value={location.path ?? ""}
                placeholder="/mnt/backup/restic"
                mono
                hint={t("repos.folderHint")}
                onChange={(path) => loc({ path })}
              />
            </FieldPair>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("repos.password")} icon={<KeyRound />}>
        <div className="flex flex-col gap-3 py-2">
          <SecretField
            label={t("repos.resticPassword")}
            value={password}
            placeholder={current ? t("repos.passwordKeep") : undefined}
            hint={
              current ? t("repos.passwordChangeHint") : t("repos.passwordHint")
            }
            onChange={setPassword}
          />
          {current && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void reveal()}>
                <Eye className="size-3.5" />
                {t("repos.reveal")}
              </Button>
              {shown && (
                <>
                  <code className="select-all border border-border px-2 py-1 font-mono text-xs">
                    {shown}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(shown);
                      toast.success(t("repos.copied"));
                    }}
                  >
                    <Copy className="size-3.5" />
                    {t("repos.copy")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {current && (
        <SectionCard title={t("repos.check")} icon={<PlugZap />}>
          <div className="flex flex-col gap-3 py-2">
            {current.kind !== "local" && (
              <SelectField
                label={t("repos.checkFrom")}
                value={checkHost ? String(checkHost) : ""}
                placeholder={t("repos.pickHost")}
                hint={t("repos.checkFromHint")}
                onChange={(value) => setCheckHost(Number(value))}
                options={hostOptions}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={checking || (!checkHost && current.kind !== "local")}
                onClick={() => void check(false)}
              >
                {t("repos.checkButton")}
              </Button>
              <Button
                size="sm"
                disabled={checking || (!checkHost && current.kind !== "local")}
                onClick={() => void check(true)}
              >
                {t("repos.initButton")}
              </Button>
              {current.kind === "rclone" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checking || !checkHost}
                  onClick={() => void addRclone()}
                >
                  {t("repos.installRclone")}
                </Button>
              )}
            </div>
            {checking && (
              <p className="text-xs text-muted-foreground">
                {t("repos.checking")}
              </p>
            )}
            {checkResult && (
              <pre className="whitespace-pre-wrap break-words text-xs">
                {checkResult}
              </pre>
            )}
          </div>
        </SectionCard>
      )}
    </InlineView>
  );
}
