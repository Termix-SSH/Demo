import { useMemo, type ComponentType } from "react";
import {
  useHostStatus,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  hostSectionsFor,
  runHostAction,
  useHostActions,
  useHostSections,
  type Host,
  type HostActionDef,
} from "@termix-ssh/plugin-sdk/ui";
import { hostTools } from "./host-tools";

type Icon = ComponentType<{ className?: string }>;

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}

/**
 * The first tab of every host: what it is, a button for each tool, and the
 * cards plugins add to a host page.
 */
export function HostOverview({ host, isVisible, shell }: TabProps) {
  const { t } = useTranslation();
  const record = host as unknown as Host | undefined;
  const all = useHostActions();
  const sections = useHostSections();
  const status = useHostStatus(Number(record?.id))?.status;
  const tools = useMemo(
    () => (record ? hostTools(all, record) : { tabs: [], launchers: [] }),
    [all, record],
  );
  const cards = useMemo(
    () => (record ? hostSectionsFor(sections, record) : []),
    [sections, record],
  );

  if (!record) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {t("hostLayout.noHost")}
      </p>
    );
  }

  const run = (action: HostActionDef) =>
    runHostAction(action, record, shell as never);
  const buttons = [...tools.tabs, ...tools.launchers];

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <section className="p-4 border-b border-border">
        <dl className="grid gap-x-6 gap-y-3 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
          <Field
            label={t("hostLayout.field.status")}
            value={t(`hostLayout.status.${status ?? "unknown"}`)}
          />
          <Field label={t("hostLayout.field.address")} value={record.ip} />
          <Field
            label={t("hostLayout.field.port")}
            value={record.port ? String(record.port) : null}
          />
          <Field label={t("hostLayout.field.user")} value={record.username} />
          <Field label={t("hostLayout.field.folder")} value={record.folder} />
          <Field
            label={t("hostLayout.field.tags")}
            value={(record.tags ?? []).join(", ")}
          />
        </dl>
        {record.notes ? (
          <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">
            {record.notes}
          </p>
        ) : null}
      </section>

      {buttons.length > 0 && (
        <section className="p-4 border-b border-border">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {t("hostLayout.tools")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {buttons.map((action) => {
              const Icon = action.icon as Icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => run(action)}
                  className="h-8 px-3 flex items-center gap-2 border border-border text-sm hover:bg-muted/40"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {action.label?.(record) ?? t(action.titleKey)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {cards.map((card) => {
        const Card = card.component;
        return (
          <section
            key={`${card.pluginId}:${card.id}`}
            className="border-b border-border"
          >
            <h3 className="px-4 pt-3 text-xs font-medium text-muted-foreground">
              {t(card.titleKey)}
            </h3>
            <div className="p-4 pt-2">
              <Card
                host={record}
                isVisible={isVisible}
                shell={shell as never}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
