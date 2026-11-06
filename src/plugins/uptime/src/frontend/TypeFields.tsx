import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Field,
  NumberField,
  SecretField,
  SelectField,
  SwitchRow,
  TextField,
  Textarea,
} from "@termix-ssh/plugin-sdk/ui";
import {
  DNS_RECORD_TYPES,
  HTTP_METHODS,
  type AuthType,
  type DnsRecordType,
  type HttpMethod,
  type MonitorConfig,
  type MonitorSecrets,
  type MonitorType,
} from "../shared/types";

/** The fields that differ per monitor type. */
export function TypeFields({
  type,
  config,
  secrets,
  headers,
  hasSecrets,
  onConfig,
  onSecrets,
  onHeaders,
}: {
  type: MonitorType;
  config: MonitorConfig;
  secrets: MonitorSecrets;
  headers: string;
  hasSecrets: boolean;
  onConfig: (patch: Partial<MonitorConfig>) => void;
  onSecrets: (patch: Partial<MonitorSecrets>) => void;
  onHeaders: (value: string) => void;
}) {
  const { t } = useTranslation();
  const secretHint = hasSecrets ? t("editor.keepSecret") : undefined;

  const target = (
    <TextField
      label={t("editor.target")}
      value={config.target ?? ""}
      onChange={(value) => onConfig({ target: value })}
      placeholder="example.com"
      mono
    />
  );
  const port = (
    <NumberField
      label={t("editor.port")}
      value={config.port ?? (type === "tls" ? 443 : 0)}
      onChange={(value) => onConfig({ port: value })}
      min={1}
      max={65535}
    />
  );
  const certDays = (
    <NumberField
      label={t("editor.certDays")}
      value={config.certWarnDays ?? 14}
      onChange={(value) => onConfig({ certWarnDays: value })}
      min={0}
      max={365}
      hint={t("editor.certDaysHint")}
    />
  );
  const keyword = (
    <>
      <TextField
        label={t("editor.keyword")}
        value={config.keyword ?? ""}
        onChange={(value) => onConfig({ keyword: value })}
        hint={t("editor.keywordHint")}
      />
      {config.keyword ? (
        <SwitchRow
          label={t("editor.keywordAbsent")}
          checked={config.keywordAbsent === true}
          onChange={(value) => onConfig({ keywordAbsent: value })}
        />
      ) : null}
    </>
  );

  switch (type) {
    case "http": {
      const authType = config.authType ?? "none";
      const hasBody = config.method === "POST" || config.method === "PUT";
      return (
        <>
          <TextField
            label={t("editor.url")}
            value={config.url ?? ""}
            onChange={(value) => onConfig({ url: value })}
            placeholder="https://example.com"
            mono
          />
          <SelectField<HttpMethod>
            label={t("editor.method")}
            value={config.method ?? "GET"}
            onChange={(value) => onConfig({ method: value })}
            options={HTTP_METHODS.map((value) => ({ value, label: value }))}
          />
          {hasBody ? (
            <Field label={t("editor.body")}>
              <Textarea
                value={config.body ?? ""}
                rows={4}
                onChange={(event) => onConfig({ body: event.target.value })}
              />
            </Field>
          ) : null}
          <TextField
            label={t("editor.accepted")}
            value={config.acceptedStatus ?? "200-299"}
            onChange={(value) => onConfig({ acceptedStatus: value })}
            hint={t("editor.acceptedHint")}
          />
          {keyword}
          <SelectField<AuthType>
            label={t("editor.auth")}
            value={authType}
            onChange={(value) => onConfig({ authType: value })}
            options={[
              { value: "none", label: t("editor.authNone") },
              { value: "basic", label: t("editor.authBasic") },
              { value: "bearer", label: t("editor.authBearer") },
            ]}
          />
          {authType === "basic" ? (
            <>
              <TextField
                label={t("editor.username")}
                value={config.username ?? ""}
                onChange={(value) => onConfig({ username: value })}
              />
              <SecretField
                label={t("editor.password")}
                value={secrets.password ?? ""}
                onChange={(value) => onSecrets({ password: value })}
                hint={secretHint}
              />
            </>
          ) : null}
          {authType === "bearer" ? (
            <SecretField
              label={t("editor.token")}
              value={secrets.token ?? ""}
              onChange={(value) => onSecrets({ token: value })}
              hint={secretHint}
            />
          ) : null}
          <Field label={t("editor.headers")} hint={t("editor.headersHint")}>
            <Textarea
              value={headers}
              rows={3}
              onChange={(event) => onHeaders(event.target.value)}
            />
          </Field>
          <SwitchRow
            label={t("editor.follow")}
            checked={config.followRedirects !== false}
            onChange={(value) => onConfig({ followRedirects: value })}
          />
          <SwitchRow
            label={t("editor.ignoreTls")}
            checked={config.ignoreTls === true}
            onChange={(value) => onConfig({ ignoreTls: value })}
          />
          {certDays}
        </>
      );
    }
    case "tcp":
      return (
        <>
          {target}
          {port}
        </>
      );
    case "ping":
      return target;
    case "dns":
      return (
        <>
          {target}
          <SelectField<DnsRecordType>
            label={t("editor.record")}
            value={config.recordType ?? "A"}
            onChange={(value) => onConfig({ recordType: value })}
            options={DNS_RECORD_TYPES.map((value) => ({ value, label: value }))}
          />
          <TextField
            label={t("editor.dnsServer")}
            value={config.dnsServer ?? ""}
            onChange={(value) => onConfig({ dnsServer: value })}
            hint={t("editor.dnsServerHint")}
          />
          <TextField
            label={t("editor.expected")}
            value={config.expected ?? ""}
            onChange={(value) => onConfig({ expected: value })}
            hint={t("editor.expectedHint")}
          />
        </>
      );
    case "tls":
      return (
        <>
          {target}
          {port}
          {certDays}
          <SwitchRow
            label={t("editor.ignoreTls")}
            checked={config.ignoreTls === true}
            onChange={(value) => onConfig({ ignoreTls: value })}
          />
        </>
      );
    case "host":
      return (
        <TextField
          label={t("editor.portOptional")}
          value={config.port ? String(config.port) : ""}
          onChange={(value) =>
            onConfig({ port: value ? Number(value) || undefined : undefined })
          }
          hint={t("editor.portOptionalHint")}
        />
      );
    case "docker":
      return (
        <TextField
          label={t("editor.container")}
          value={config.container ?? ""}
          onChange={(value) => onConfig({ container: value })}
          mono
        />
      );
    case "systemd":
      return (
        <TextField
          label={t("editor.unit")}
          value={config.unit ?? ""}
          onChange={(value) => onConfig({ unit: value })}
          placeholder="nginx.service"
          mono
        />
      );
    case "command":
      return (
        <>
          <Field label={t("editor.command")} hint={t("editor.commandHint")}>
            <Textarea
              value={config.command ?? ""}
              rows={3}
              className="font-mono"
              onChange={(event) => onConfig({ command: event.target.value })}
            />
          </Field>
          {keyword}
        </>
      );
    default:
      return null;
  }
}
