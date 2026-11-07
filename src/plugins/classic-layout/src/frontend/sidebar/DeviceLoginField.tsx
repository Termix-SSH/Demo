import { Select2, type DeviceLogin } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useEffect, useState } from "react";

/** A shared host's or folder's login kept on this desktop. */
export function useDeviceLogin(
  enabled: boolean,
  load: () => Promise<DeviceLogin>,
  save: (credentialId: number | null) => Promise<unknown>,
) {
  const [credentials, setCredentials] = useState<DeviceLogin["credentials"]>(
    [],
  );
  const [value, setValue] = useState("");
  const [initial, setInitial] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        const id =
          result.credentialId == null ? "" : String(result.credentialId);
        setCredentials(result.credentials);
        setValue(id);
        setInitial(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    enabled,
    credentials,
    value,
    setValue,
    dirty: value !== initial,
    save: () => save(value ? Number(value) : null),
  };
}

export function DeviceLoginField({
  id,
  login,
}: {
  id: string;
  login: ReturnType<typeof useDeviceLogin>;
}) {
  const { t } = useTranslation();
  if (!login.enabled) return null;
  return (
    <div className="flex flex-col gap-2 pt-3">
      <label
        htmlFor={id}
        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {t("sharing.deviceLogin.label")}
      </label>
      <Select2
        id={id}
        value={login.value}
        onChange={(event) => login.setValue(event.target.value)}
        className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{t("sharing.deviceLogin.none")}</option>
        {login.credentials.map((credential) => (
          <option key={credential.id} value={credential.id}>
            {credential.username
              ? `${credential.name} (${credential.username})`
              : credential.name}
          </option>
        ))}
      </Select2>
      <p className="text-[10px] text-muted-foreground">
        {t(
          login.credentials.length === 0
            ? "sharing.deviceLogin.noCredentials"
            : "sharing.deviceLogin.hint",
        )}
      </p>
    </div>
  );
}
