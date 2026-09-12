import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Info, Lock, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { PasswordInput } from "@/components/password-input";
import { SectionCard } from "@/components/section-card";
import { FolderPathPicker } from "@/sidebar/FolderPathPicker";
import { copyToClipboard } from "@/lib/clipboard";
import { TagInput } from "@/demo/DemoHostEditor";
import type { Credential } from "@/types/ui-types";

export interface CredentialEditorForm {
  name: string;
  username: string;
  folder: string;
  description: string;
  tags: string[];
  tagInput: string;
  password: string;
  value: string;
  publicKey: string;
  passphrase: string;
  certPublicKey: string;
}

export function createCredentialEditorForm(
  credential: Credential | null,
): CredentialEditorForm {
  return {
    name: credential?.name ?? "",
    username: credential?.username ?? "",
    folder: credential?.folder ?? "",
    description: credential?.description ?? "",
    tags: credential?.tags ?? [],
    tagInput: "",
    password:
      credential?.type === "password"
        ? (credential?.value ?? "")
        : (credential?.password ?? ""),
    value: credential?.type === "key" ? (credential?.value ?? "") : "",
    publicKey: credential?.publicKey ?? "",
    passphrase: credential?.passphrase ?? "",
    certPublicKey: credential?.certPublicKey ?? "",
  };
}

type SetField = <K extends keyof CredentialEditorForm>(
  key: K,
  value: CredentialEditorForm[K],
) => void;

export function DemoCredentialEditor({
  form,
  setField,
  activeTab,
  existingFolders,
}: {
  form: CredentialEditorForm;
  setField: SetField;
  activeTab: string;
  existingFolders: string[];
}) {
  const { t } = useTranslation();
  const keyFileRef = useRef<HTMLInputElement>(null);
  const certFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      {activeTab === "general" && (
        <SectionCard
          title={t("hosts.basicInformation")}
          icon={<Info className="size-3.5" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.friendlyNameLabel")}
              </label>
              <Input
                placeholder="e.g. Production SSH Key"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.folder")}
              </label>
              <FolderPathPicker
                value={form.folder}
                onChange={(path) => setField("folder", path)}
                folderPaths={existingFolders}
              />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.descriptionLabel")}
              </label>
              <Input
                placeholder="Optional details..."
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.tags")}
              </label>
              <TagInput
                tags={form.tags}
                input={form.tagInput}
                placeholder={t("hosts.addTagsPlaceholder")}
                onTagsChange={(tags) => setField("tags", tags)}
                onInputChange={(value) => setField("tagInput", value)}
              />
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === "auth" && (
        <SectionCard
          title={t("hosts.authDetailsSection")}
          icon={<Lock className="size-3.5" />}
        >
          <div className="flex flex-col gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.username")}
              </label>
              <Input
                placeholder="e.g. root or deploy"
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.password")} ({t("common.optional")})
              </label>
              <PasswordInput
                className="h-8 text-xs pr-8"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="p-3 border border-border bg-muted/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {t("hosts.generateKeyPairTitle")}
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  {t("hosts.generateKeyPairDescription")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Ed25519", "ECDSA (nistp256)", "RSA (2048)"].map(
                    (label) => (
                      <Button
                        key={label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] px-2"
                      >
                        {t("hosts.generateLabel", { label })}
                      </Button>
                    ),
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.sshPrivateKey")}
                  </label>
                  <button
                    type="button"
                    className="text-[10px] text-accent-brand hover:text-accent-brand/80 flex items-center gap-1"
                    onClick={() => keyFileRef.current?.click()}
                  >
                    <Upload className="size-3" /> {t("hosts.uploadFileBtn")}
                  </button>
                </div>
                <input
                  ref={keyFileRef}
                  type="file"
                  accept=".pem,.key,.ppk,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setField("value", (await file.text()).trim());
                    e.target.value = "";
                  }}
                />
                <textarea
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  rows={8}
                  value={form.value}
                  onChange={(e) => setField("value", e.target.value)}
                  className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.keyPassphraseOptional")}
                </label>
                <PasswordInput
                  className="h-8 text-xs pr-8"
                  placeholder="••••••••"
                  value={form.passphrase}
                  onChange={(e) => setField("passphrase", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.sshPublicKeyOptional")}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    disabled={!form.publicKey}
                    onClick={() => {
                      void copyToClipboard(form.publicKey);
                      toast.success(t("hosts.publicKeyCopied"));
                    }}
                  >
                    <Copy className="size-3 mr-1" /> {t("common.copy")}
                  </Button>
                </div>
                <textarea
                  placeholder="ssh-rsa AAAAB3Nza..."
                  rows={3}
                  value={form.publicKey}
                  onChange={(e) => setField("publicKey", e.target.value)}
                  className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5 p-3 border border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("credentials.caCertificate")}
                  </label>
                  {form.certPublicKey && (
                    <button
                      type="button"
                      className="text-[10px] text-destructive hover:text-destructive/80"
                      onClick={() => setField("certPublicKey", "")}
                    >
                      {t("credentials.clearCert")}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t("credentials.caCertificateDescription")}
                </p>
                <button
                  type="button"
                  className="text-[10px] text-accent-brand hover:text-accent-brand/80 flex items-center gap-1 self-start"
                  onClick={() => certFileRef.current?.click()}
                >
                  <Upload className="size-3" />{" "}
                  {t("credentials.uploadCertFile")}
                </button>
                <input
                  ref={certFileRef}
                  type="file"
                  accept=".pub,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setField("certPublicKey", (await file.text()).trim());
                    e.target.value = "";
                  }}
                />
                <textarea
                  placeholder={t("credentials.pasteOrUploadCert")}
                  rows={2}
                  value={form.certPublicKey}
                  onChange={(e) => setField("certPublicKey", e.target.value)}
                  className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
