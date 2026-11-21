import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

export type ManagerView =
  "hosts" | "host-editor" | "credentials" | "credential-editor" | "defaults";

/** The row of sub-tabs across the top of the old Host Manager. */
export function ManagerTabs({
  view,
  editingHost,
  editingCredential,
  canAddHost,
  onPick,
}: {
  view: ManagerView;
  /** An existing host is open, so the editor tab reads Edit Host. */
  editingHost: boolean;
  editingCredential: boolean;
  canAddHost: boolean;
  onPick: (view: ManagerView) => void;
}) {
  const { t } = useTranslation();
  const tabs: { id: ManagerView; label: string; disabled?: boolean }[] = [
    { id: "hosts", label: t("original.manager.hostViewer") },
    {
      id: "host-editor",
      label: editingHost
        ? t("original.manager.editHost")
        : t("original.manager.addHost"),
      disabled: !editingHost && !canAddHost,
    },
    { id: "credentials", label: t("original.manager.credentialsViewer") },
    {
      id: "credential-editor",
      label: editingCredential
        ? t("original.manager.editCredential")
        : t("original.manager.addCredential"),
    },
    { id: "defaults", label: t("original.manager.defaults") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("original.hostManager")}
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[0.5rem] border-2 border-border bg-[var(--original-field,var(--muted))] p-1 thin-scrollbar"
    >
      {tabs.map((tab) => {
        const active = tab.id === view;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            onClick={() => onPick(tab.id)}
            className={`shrink-0 rounded-[0.375rem] px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
