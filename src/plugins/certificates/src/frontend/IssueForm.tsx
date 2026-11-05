import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Field,
  FormFooter,
  PanelShell,
  SelectField,
  SwitchRow,
  TagInput,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { AcmeClient, CertStatus, Challenge } from "../shared/types";
import { issueCertificate } from "./api";
import type { Runner } from "./CertificatesTab";

/** A new certificate from certbot or acme.sh. */
export function IssueForm({
  hostId,
  status,
  runner,
  onClose,
}: {
  hostId: number;
  status: CertStatus;
  runner: Runner;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const clients: AcmeClient[] = [
    ...(status.certbot ? (["certbot"] as const) : []),
    ...(status.acmesh ? (["acme.sh"] as const) : []),
  ];
  const [client, setClient] = useState<AcmeClient>(clients[0] ?? "certbot");
  const [domains, setDomains] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [challenge, setChallenge] = useState<Challenge>("standalone");
  const [webroot, setWebroot] = useState("/var/www/html");
  const [dnsProvider, setDnsProvider] = useState("cloudflare");
  const [credentials, setCredentials] = useState("");
  const [email, setEmail] = useState("");
  const [keyType, setKeyType] = useState<"ecdsa" | "rsa">("ecdsa");
  const [staging, setStaging] = useState(false);

  const all = [...domains, ...(input.trim() ? [input.trim()] : [])];
  const ready =
    all.length > 0 &&
    (challenge !== "webroot" || !!webroot.trim()) &&
    (challenge !== "dns" || !!dnsProvider.trim());

  const save = async () => {
    const done = await runner.run(
      t("issue.title"),
      () =>
        issueCertificate(hostId, {
          client,
          domains: all,
          challenge,
          webroot: challenge === "webroot" ? webroot.trim() : undefined,
          dnsProvider: challenge === "dns" ? dnsProvider.trim() : undefined,
          credentials:
            challenge === "dns" && credentials.trim()
              ? credentials.trim()
              : undefined,
          email: email.trim() || undefined,
          staging,
          keyType,
        }),
      t("issue.done"),
    );
    if (done) onClose();
  };

  return (
    <PanelShell
      icon={<ShieldPlus className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={t("issue.title")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={runner.busy}
          saveLabel={t("issue.save")}
          cancelLabel={t("common.cancel")}
          disabled={!ready}
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {clients.length > 1 && (
          <SelectField<AcmeClient>
            label={t("issue.client")}
            value={client}
            onChange={setClient}
            options={clients.map((value) => ({ value, label: value }))}
          />
        )}
        <Field label={t("issue.domains")} hint={t("issue.domainsHint")}>
          <TagInput
            tags={domains}
            input={input}
            placeholder={t("issue.domainsPlaceholder")}
            onTagsChange={setDomains}
            onInputChange={setInput}
          />
        </Field>
        <SelectField<Challenge>
          label={t("issue.challenge")}
          value={challenge}
          onChange={setChallenge}
          options={[
            { value: "standalone", label: t("issue.standalone") },
            { value: "webroot", label: t("issue.webroot") },
            { value: "dns", label: t("issue.dns") },
          ]}
          hint={t(`issue.${challenge}Hint`)}
        />
        {challenge === "webroot" && (
          <TextField
            label={t("issue.webrootPath")}
            hint={t("issue.webrootPathHint")}
            value={webroot}
            onChange={setWebroot}
            mono
          />
        )}
        {challenge === "dns" && (
          <>
            <TextField
              label={t("issue.dnsProvider")}
              hint={
                client === "certbot"
                  ? t("issue.dnsProviderCertbot")
                  : t("issue.dnsProviderAcme")
              }
              value={dnsProvider}
              onChange={setDnsProvider}
              mono
            />
            {client === "certbot" && (
              <TextField
                label={t("issue.credentials")}
                hint={t("issue.credentialsHint")}
                value={credentials}
                onChange={setCredentials}
                placeholder="/root/.secrets/cloudflare.ini"
                mono
              />
            )}
          </>
        )}
        <TextField
          label={t("issue.email")}
          hint={t("issue.emailHint")}
          value={email}
          onChange={setEmail}
        />
        <SelectField<"ecdsa" | "rsa">
          label={t("issue.keyType")}
          value={keyType}
          onChange={setKeyType}
          options={[
            { value: "ecdsa", label: "ECDSA" },
            { value: "rsa", label: "RSA" },
          ]}
        />
        <SwitchRow
          label={t("issue.staging")}
          description={t("issue.stagingHint")}
          checked={staging}
          onChange={setStaging}
        />
        {runner.busy && (
          <p className="text-xs text-muted-foreground">{t("issue.working")}</p>
        )}
      </div>
    </PanelShell>
  );
}
