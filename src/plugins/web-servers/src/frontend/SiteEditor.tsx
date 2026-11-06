import { useEffect, useState } from "react";
import { Earth, Eye, ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  Field,
  FormFooter,
  InlineView,
  NumberField,
  PanelShell,
  Segmented,
  SelectField,
  SwitchRow,
  TagInput,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  ServerKind,
  Site,
  SiteSpec,
  SiteType,
  WebStatus,
} from "../shared/types";
import {
  createSite,
  errorMessage,
  getSite,
  issueCertificate,
  previewSite,
  updateSite,
} from "./api";
import { dropSpec } from "../shared/spec";
import { SERVER_LABEL } from "./format";
import { Loading } from "./Loading";
import type { Runner } from "./WebServersTab";

type Mode = "form" | "text";

function blankSpec(status: WebStatus): SiteSpec {
  return {
    type: "static",
    names: [],
    port: 80,
    root: "",
    index: "",
    spa: false,
    upstream: "http://127.0.0.1:3000",
    websockets: true,
    redirectTo: "",
    keepPath: true,
    phpSocket: status.phpSockets[0] ?? "",
    https: false,
    httpsPort: 443,
    certPath: "",
    keyPath: "",
    forceHttps: true,
    gzip: true,
    maxBodyMb: 0,
    accessLog: true,
  };
}

/** Adds a site, or changes one with the site form or as text. */
export function SiteEditor({
  hostId,
  status,
  site,
  runner,
  onClose,
}: {
  hostId: number;
  status: WebStatus;
  /** Null for a new site. */
  site: Site | null;
  runner: Runner;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const kinds = status.servers
    .filter((s) => s.installed)
    .map((s) => s.kind) as ServerKind[];
  const [server, setServer] = useState<ServerKind>(site?.server ?? kinds[0]);
  const [name, setName] = useState(site?.name ?? "");
  const [spec, setSpec] = useState<SiteSpec>(() => blankSpec(status));
  const [names, setNamesInput] = useState("");
  const [mode, setMode] = useState<Mode>("form");
  const [text, setText] = useState("");
  const [file, setFile] = useState("");
  const [loaded, setLoaded] = useState(site === null);
  const [failed, setFailed] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [staging, setStaging] = useState(false);

  useEffect(() => {
    if (!site) return;
    let live = true;
    void getSite(hostId, site.server, site.name)
      .then((data) => {
        if (!live) return;
        setText(dropSpec(data.content));
        setFile(data.file);
        if (data.spec) setSpec({ ...blankSpec(status), ...data.spec });
        setMode(data.spec ? "form" : "text");
        setLoaded(true);
      })
      .catch((e) => live && setFailed(errorMessage(e, t("sites.loadFailed"))));
    return () => {
      live = false;
    };
    // The site only changes with a new editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof SiteSpec>(key: K, value: SiteSpec[K]) =>
    setSpec((prev) => ({ ...prev, [key]: value }));

  const allNames = [...spec.names, ...(names.trim() ? [names.trim()] : [])];
  const fullSpec = { ...spec, names: allNames };
  const canEdit = status.canEdit;
  const isNew = site === null;
  // A file written by hand has no form values, so it is edited as text.
  const showModes = isNew || !!site?.spec;

  const ready =
    !!name.trim() &&
    (mode === "text"
      ? !!text.trim()
      : allNames.length > 0 &&
        (spec.type !== "static" && spec.type !== "php" ? true : !!spec.root) &&
        (spec.type !== "proxy" || !!spec.upstream) &&
        (spec.type !== "redirect" || !!spec.redirectTo) &&
        (spec.type !== "php" || !!spec.phpSocket));

  const save = async () => {
    const body = mode === "text" ? { content: text } : { spec: fullSpec };
    const done = await runner.run(
      isNew ? t("site.addTitle") : t("site.editTitle", { name }),
      () =>
        isNew
          ? createSite(hostId, server, name.trim(), body)
          : updateSite(hostId, server, name, body),
      isNew ? t("site.added", { name }) : t("site.saved", { name }),
    );
    if (done) onClose();
  };

  const showPreview = async () => {
    try {
      setPreview(
        await previewSite(hostId, server, name.trim() || "site", fullSpec),
      );
    } catch (e) {
      setPreview(errorMessage(e, t("site.previewFailed")));
    }
  };

  const getCert = async () => {
    if (!site) return;
    const done = await runner.run(
      t("tls.title"),
      () => issueCertificate(hostId, site, { email: email.trim(), staging }),
      t("tls.done"),
    );
    if (done) onClose();
  };

  const header = (
    <PanelShell
      icon={<Earth className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={isNew ? t("site.addTitle") : site!.name}
      status={file}
      actions={
        mode === "form" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void showPreview()}
            disabled={allNames.length === 0}
          >
            <Eye className="size-4" />
            {t("site.preview")}
          </Button>
        ) : undefined
      }
      footer={
        canEdit ? (
          <FormFooter
            onCancel={onClose}
            onSave={() => void save()}
            saving={runner.busy}
            saveLabel={isNew ? t("site.add") : t("site.save")}
            cancelLabel={t("common.cancel")}
            disabled={!ready}
          />
        ) : undefined
      }
    >
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !loaded ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {isNew && (
            <>
              {kinds.length > 1 && (
                <SelectField<ServerKind>
                  label={t("site.server")}
                  value={server}
                  onChange={setServer}
                  options={kinds.map((value) => ({
                    value,
                    label: SERVER_LABEL[value],
                  }))}
                />
              )}
              <TextField
                label={t("site.name")}
                hint={t("site.nameHint")}
                value={name}
                onChange={setName}
                placeholder="example"
                mono
              />
            </>
          )}
          {showModes && (
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "form", label: t("site.modeForm") },
                { value: "text", label: t("site.modeText") },
              ]}
            />
          )}
          {mode === "text" ? (
            <>
              {site?.spec && (
                <p className="text-xs text-muted-foreground">
                  {t("site.textHint")}
                </p>
              )}
              <TextAreaField
                label={t("site.text")}
                value={text}
                onChange={setText}
                rows={22}
                mono
                disabled={!canEdit}
              />
            </>
          ) : (
            <SiteForm
              server={server}
              spec={spec}
              set={set}
              names={names}
              setNames={setNamesInput}
              status={status}
            />
          )}
          {!isNew && server !== "caddy" && canEdit && (
            <TlsBox
              status={status}
              server={server}
              email={email}
              setEmail={setEmail}
              staging={staging}
              setStaging={setStaging}
              busy={runner.busy}
              onIssue={() => void getCert()}
              managed={!!site?.spec}
            />
          )}
        </div>
      )}
    </PanelShell>
  );

  return (
    <>
      {header}
      <InlineView
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        title={t("site.preview")}
        bare
      >
        <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
          {preview}
        </pre>
      </InlineView>
    </>
  );
}

function SiteForm({
  server,
  spec,
  set,
  names,
  setNames,
  status,
}: {
  server: ServerKind;
  spec: SiteSpec;
  set: <K extends keyof SiteSpec>(key: K, value: SiteSpec[K]) => void;
  names: string;
  setNames: (value: string) => void;
  status: WebStatus;
}) {
  const { t } = useTranslation();
  const type = spec.type;
  return (
    <>
      <SelectField<SiteType>
        label={t("site.type")}
        value={type}
        onChange={(value) => set("type", value)}
        options={[
          { value: "static", label: t("site.typeStatic") },
          { value: "proxy", label: t("site.typeProxy") },
          { value: "php", label: t("site.typePhp") },
          { value: "redirect", label: t("site.typeRedirect") },
        ]}
        hint={t(`site.${type}Hint`)}
      />
      <Field label={t("site.domains")} hint={t("site.domainsHint")}>
        <TagInput
          tags={spec.names}
          input={names}
          placeholder="example.com"
          onTagsChange={(tags) => set("names", tags)}
          onInputChange={setNames}
        />
      </Field>
      <NumberField
        label={t("site.port")}
        value={spec.port}
        onChange={(value) => set("port", value)}
        min={1}
        max={65535}
      />
      {(type === "static" || type === "php") && (
        <>
          <TextField
            label={t("site.root")}
            hint={t("site.rootHint")}
            value={spec.root}
            onChange={(value) => set("root", value)}
            placeholder="/var/www/example"
            mono
          />
          <TextField
            label={t("site.index")}
            value={spec.index}
            onChange={(value) => set("index", value)}
            placeholder={type === "php" ? "index.php index.html" : "index.html"}
            mono
          />
        </>
      )}
      {type === "static" && (
        <SwitchRow
          label={t("site.spa")}
          description={t("site.spaHint")}
          checked={spec.spa}
          onChange={(value) => set("spa", value)}
        />
      )}
      {type === "proxy" && (
        <>
          <TextField
            label={t("site.upstream")}
            hint={t("site.upstreamHint")}
            value={spec.upstream}
            onChange={(value) => set("upstream", value)}
            placeholder="http://127.0.0.1:3000"
            mono
          />
          {server !== "caddy" && (
            <SwitchRow
              label={t("site.websockets")}
              checked={spec.websockets}
              onChange={(value) => set("websockets", value)}
            />
          )}
        </>
      )}
      {type === "redirect" && (
        <>
          <TextField
            label={t("site.redirectTo")}
            value={spec.redirectTo}
            onChange={(value) => set("redirectTo", value)}
            placeholder="https://example.com"
            mono
          />
          <SwitchRow
            label={t("site.keepPath")}
            description={t("site.keepPathHint")}
            checked={spec.keepPath}
            onChange={(value) => set("keepPath", value)}
          />
        </>
      )}
      {type === "php" &&
        (status.phpSockets.length > 0 ? (
          <SelectField<string>
            label={t("site.phpSocket")}
            value={spec.phpSocket}
            onChange={(value) => set("phpSocket", value)}
            options={status.phpSockets.map((value) => ({
              value,
              label: value,
            }))}
          />
        ) : (
          <TextField
            label={t("site.phpSocket")}
            hint={t("site.phpSocketHint")}
            value={spec.phpSocket}
            onChange={(value) => set("phpSocket", value)}
            placeholder="/run/php/php8.2-fpm.sock"
            mono
          />
        ))}
      <SwitchRow
        label={t("site.https")}
        description={
          server === "caddy" ? t("site.httpsCaddy") : t("site.httpsHint")
        }
        checked={spec.https}
        onChange={(value) => set("https", value)}
      />
      {spec.https && (
        <>
          <NumberField
            label={t("site.httpsPort")}
            value={spec.httpsPort}
            onChange={(value) => set("httpsPort", value)}
            min={1}
            max={65535}
          />
          {server !== "caddy" && (
            <>
              <TextField
                label={t("site.certPath")}
                value={spec.certPath}
                onChange={(value) => set("certPath", value)}
                placeholder="/etc/letsencrypt/live/example.com/fullchain.pem"
                mono
              />
              <TextField
                label={t("site.keyPath")}
                value={spec.keyPath}
                onChange={(value) => set("keyPath", value)}
                placeholder="/etc/letsencrypt/live/example.com/privkey.pem"
                mono
              />
            </>
          )}
          <SwitchRow
            label={t("site.forceHttps")}
            checked={spec.forceHttps}
            onChange={(value) => set("forceHttps", value)}
          />
        </>
      )}
      <SwitchRow
        label={t("site.gzip")}
        checked={spec.gzip}
        onChange={(value) => set("gzip", value)}
      />
      <SwitchRow
        label={t("site.accessLog")}
        checked={spec.accessLog}
        onChange={(value) => set("accessLog", value)}
      />
      <NumberField
        label={t("site.maxBody")}
        hint={t("site.maxBodyHint")}
        value={spec.maxBodyMb}
        onChange={(value) => set("maxBodyMb", value)}
        min={0}
        max={102400}
      />
    </>
  );
}

function TlsBox({
  status,
  server,
  email,
  setEmail,
  staging,
  setStaging,
  busy,
  onIssue,
  managed,
}: {
  status: WebStatus;
  server: ServerKind;
  email: string;
  setEmail: (value: string) => void;
  staging: boolean;
  setStaging: (value: boolean) => void;
  busy: boolean;
  onIssue: () => void;
  managed: boolean;
}) {
  const { t } = useTranslation();
  const plugin =
    server === "nginx" ? status.certbotNginx : status.certbotApache;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4" />
        {t("tls.title")}
      </div>
      {!status.certbot || !plugin ? (
        <p className="text-xs text-muted-foreground">{t("tls.needCertbot")}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {managed ? t("tls.hintManaged") : t("tls.hintText")}
          </p>
          <TextField
            label={t("tls.email")}
            hint={t("tls.emailHint")}
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
          <SwitchRow
            label={t("tls.staging")}
            description={t("tls.stagingHint")}
            checked={staging}
            onChange={setStaging}
          />
          <div>
            <Button size="sm" disabled={busy} onClick={onIssue}>
              <ShieldCheck className="size-4" />
              {t("tls.issue")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
