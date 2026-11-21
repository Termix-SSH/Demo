import { X } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { PREFIX_KEY_HELP } from "../shell/prefix-keys";

/** The prefix keys, in a small box above the status bar. */
export function KeyHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("terminalLayout.help.title")}
      className="absolute right-2 bottom-2 z-30 w-80 max-w-[calc(100%-1rem)] border border-border bg-card font-mono text-xs shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-foreground">
          {t("terminalLayout.help.title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("terminalLayout.help.close")}
          className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>
      <p className="border-b border-border px-3 py-1.5 text-muted-foreground">
        {t("terminalLayout.help.intro")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2">
        {PREFIX_KEY_HELP.map((row) => (
          <div key={row.labelKey} className="contents">
            <dt className="text-accent-brand">{row.keys}</dt>
            <dd className="text-muted-foreground">{t(row.labelKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
