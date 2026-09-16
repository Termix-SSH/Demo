import { Info, KeyRound, Lock, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { FolderPathPicker } from "@/sidebar/FolderPathPicker";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Field,
  FieldPair,
  SecretField,
  SelectField,
  SwitchRow,
  TagInput,
  TextAreaField,
  TextField,
  useFileText,
} from "@/demo/hosts/host-fields";
import { Section } from "@/demo/hosts/host-sections";
import type {
  CredentialEditorForm,
  FieldErrors,
} from "@/demo/hosts/host-form";

type SetField = <K extends keyof CredentialEditorForm>(
  key: K,
  value: CredentialEditorForm[K],
) => void;

/** The credential editor's sections, matching the host editor's shape. */
export const CREDENTIAL_SECTIONS = [
  { id: "credential-identity", label: "Identity", icon: Info },
  { id: "credential-secret", label: "Secret", icon: Lock },
  { id: "credential-organization", label: "Organization", icon: Tag },
];

export function CredentialEditorBody({
  form,
  setField,
  errors,
  folderPaths,
}: {
  form: CredentialEditorForm;
  setField: SetField;
  errors: FieldErrors;
  folderPaths: string[];
}) {
  const keyFile = useFileText((text) => setField("value", text));
  const certFile = useFileText((text) => setField("certPublicKey", text));
  const isKey = form.authType === "key";

  return (
    <>
      <Section id="credential-identity">
        <SectionCard title="Identity" icon={<Info className="size-3.5" />}>
          <div className="flex flex-col gap-4 py-3">
            <FieldPair>
              <TextField
                label="Name"
                placeholder="Production deploy key"
                value={form.name}
                error={errors.name}
                onChange={(v) => setField("name", v)}
              />
              <TextField
                label="Username"
                placeholder="root"
                hint="Hosts using this credential sign in as this user."
                value={form.username}
                onChange={(v) => setField("username", v)}
              />
            </FieldPair>
            <TextField
              label="Description"
              placeholder="What this is for."
              value={form.description}
              onChange={(v) => setField("description", v)}
            />
          </div>
        </SectionCard>
      </Section>

      <Section id="credential-secret">
        <SectionCard title="Secret" icon={<KeyRound className="size-3.5" />}>
          <div className="flex flex-col gap-4 py-3">
            <SelectField
              label="Type"
              value={form.authType}
              onChange={(v) => setField("authType", v)}
              options={[
                { value: "password", label: "Password" },
                { value: "key", label: "SSH key" },
              ]}
              hint="This used to be guessed from whether a key was present."
            />

            {!isKey && (
              <SecretField
                label="Password"
                value={form.password}
                error={errors.password}
                onChange={(v) => setField("password", v)}
              />
            )}

            {isKey && (
              <>
                <div className="border border-border bg-muted/20 p-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Generate a key pair
                  </p>
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    Termix keeps the private key and gives you the public one to
                    put on your servers.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["Ed25519", "ECDSA (nistp256)", "RSA (2048)"].map(
                      (label) => (
                        <Button
                          key={label}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            toast.info("Key generation is not part of the demo.")
                          }
                        >
                          {label}
                        </Button>
                      ),
                    )}
                  </div>
                </div>

                <TextAreaField
                  label="Private key"
                  rows={8}
                  mono
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={form.value}
                  error={errors.value}
                  onChange={(v) => setField("value", v)}
                  aside={
                    <label className="cursor-pointer text-[10px] text-accent-brand hover:underline">
                      Upload
                      <input
                        type="file"
                        accept=".pem,.key,.ppk,.txt"
                        className="hidden"
                        onChange={(e) => {
                          void keyFile.onFile(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  }
                />

                <FieldPair>
                  <SecretField
                    label="Passphrase"
                    placeholder="Optional"
                    value={form.passphrase}
                    onChange={(v) => setField("passphrase", v)}
                  />
                  <SecretField
                    label="Password"
                    placeholder="Optional, for sudo"
                    value={form.password}
                    onChange={(v) => setField("password", v)}
                  />
                </FieldPair>

                <TextAreaField
                  label="Public key"
                  rows={3}
                  mono
                  placeholder="ssh-ed25519 AAAA..."
                  value={form.publicKey}
                  onChange={(v) => setField("publicKey", v)}
                  aside={
                    <button
                      type="button"
                      disabled={!form.publicKey}
                      onClick={() => {
                        void copyToClipboard(form.publicKey);
                        toast.success("Public key copied");
                      }}
                      className="text-[10px] text-accent-brand hover:underline disabled:opacity-40"
                    >
                      Copy
                    </button>
                  }
                />

                <div className="flex flex-col gap-1.5 border border-border bg-muted/20 p-3">
                  <Field
                    label="CA certificate"
                    hint="For servers that trust a signing authority instead of the key itself."
                    aside={
                      form.certPublicKey ? (
                        <button
                          type="button"
                          className="text-[10px] text-destructive hover:underline"
                          onClick={() => setField("certPublicKey", "")}
                        >
                          Clear
                        </button>
                      ) : (
                        <label className="cursor-pointer text-[10px] text-accent-brand hover:underline">
                          Upload
                          <input
                            type="file"
                            accept=".pub,.txt"
                            className="hidden"
                            onChange={(e) => {
                              void certFile.onFile(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )
                    }
                  >
                    <textarea
                      rows={2}
                      value={form.certPublicKey}
                      placeholder="Paste a -cert.pub file"
                      onChange={(e) =>
                        setField("certPublicKey", e.target.value)
                      }
                      className="w-full resize-none border border-input bg-background px-3 py-2 font-mono text-[10px] text-foreground transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                  </Field>
                </div>
              </>
            )}
          </div>
        </SectionCard>
      </Section>

      <Section id="credential-organization">
        <SectionCard title="Organization" icon={<Tag className="size-3.5" />}>
          <div className="flex flex-col gap-4 py-3">
            <Field label="Folder">
              <FolderPathPicker
                value={form.folder}
                onChange={(path) => setField("folder", path)}
                folderPaths={folderPaths}
              />
            </Field>
            <Field label="Tags">
              <TagInput
                tags={form.tags}
                input={form.tagInput}
                placeholder="Add a tag"
                onTagsChange={(tags) => setField("tags", tags)}
                onInputChange={(v) => setField("tagInput", v)}
              />
            </Field>
            <SwitchRow
              label="Pin to the top of the list"
              checked={form.pin}
              onChange={(v) => setField("pin", v)}
            />
          </div>
        </SectionCard>
      </Section>
    </>
  );
}
