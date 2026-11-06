import { Download, Earth, ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { ServerInfo, ServiceAction, WebStatus } from "../shared/types";
import {
  errorMessage,
  installCertbot,
  installServer,
  serviceAction,
  testConfig,
} from "./api";
import { SERVER_LABEL, badgeTone, isUp, stateTone } from "./format";
import type { Runner } from "./WebServersTab";

/** Each server's state with its service buttons, plus certbot. */
export function ServerView({
  hostId,
  status,
  runner,
}: {
  hostId: number;
  status: WebStatus;
  runner: Runner;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canEdit = status.canEdit;
  const canInstall = canEdit && status.manager !== "none";

  const act = async (server: ServerInfo, action: ServiceAction) => {
    if (
      action === "stop" &&
      !(await confirm({
        title: t("server.stopTitle", { server: SERVER_LABEL[server.kind] }),
        description: t("server.stopBody"),
        confirmLabel: t("server.stop"),
      }))
    )
      return;
    await runner.run(
      t(`server.${action}`),
      () => serviceAction(hostId, server.kind, action),
      t("server.done", { server: SERVER_LABEL[server.kind] }),
    );
  };

  const test = async (server: ServerInfo) => {
    try {
      const result = await testConfig(hostId, server.kind);
      runner.show(
        result.ok ? t("config.testOk") : t("config.testFailed"),
        result.ok,
        result.output,
      );
    } catch (e) {
      runner.show(
        t("config.test"),
        false,
        errorMessage(e, t("actions.failed")),
      );
    }
  };

  const install = async (server: ServerInfo) => {
    if (
      !(await confirm({
        title: t("server.installTitle", { server: SERVER_LABEL[server.kind] }),
        description: t("server.installBody"),
        confirmLabel: t("server.install"),
        destructive: false,
      }))
    )
      return;
    await runner.run(
      t("server.install"),
      () => installServer(hostId, server.kind),
      t("server.installed", { server: SERVER_LABEL[server.kind] }),
    );
  };

  const certbotPlugins = [
    status.certbotNginx ? "nginx" : "",
    status.certbotApache ? "Apache" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const needsPlugin = status.servers.some(
    (s) =>
      s.installed &&
      ((s.kind === "nginx" && !status.certbotNginx) ||
        (s.kind === "apache" && !status.certbotApache)),
  );

  return (
    <div className="flex flex-col">
      <PanelList>
        {status.servers.map((server, index) => (
          <ListRow
            key={server.kind}
            stripe={index}
            tone={server.installed ? stateTone(server.state) : "muted"}
            dimmed={!server.installed}
            icon={<Earth className="size-4" />}
            title={SERVER_LABEL[server.kind]}
            badges={
              server.installed ? (
                <>
                  <ListBadge tone={badgeTone(server.state)}>
                    {server.state || t("server.unknown")}
                  </ListBadge>
                  {server.boot && (
                    <ListBadge tone="muted">{t("server.atBoot")}</ListBadge>
                  )}
                </>
              ) : (
                <ListBadge tone="muted">{t("server.notInstalled")}</ListBadge>
              )
            }
            meta={
              server.installed
                ? [server.version, server.unit, server.mainFile].join(" | ")
                : undefined
            }
          >
            {server.installed ? (
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={runner.busy}
                  onClick={() => void test(server)}
                >
                  {t("config.test")}
                </Button>
                {canEdit && (
                  <>
                    {isUp(server.state) ? (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={runner.busy}
                          onClick={() => void act(server, "reload")}
                        >
                          {t("server.reload")}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={runner.busy}
                          onClick={() => void act(server, "restart")}
                        >
                          {t("server.restart")}
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={runner.busy}
                          onClick={() => void act(server, "stop")}
                        >
                          {t("server.stop")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="xs"
                        disabled={runner.busy}
                        onClick={() => void act(server, "start")}
                      >
                        {t("server.start")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={runner.busy}
                      onClick={() =>
                        void act(server, server.boot ? "disable" : "enable")
                      }
                    >
                      {server.boot ? t("server.noBoot") : t("server.boot")}
                    </Button>
                  </>
                )}
              </div>
            ) : canInstall ? (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={runner.busy}
                  onClick={() => void install(server)}
                >
                  <Download className="size-3.5" />
                  {t("server.install")}
                </Button>
              </div>
            ) : null}
          </ListRow>
        ))}
        <ListRow
          stripe={status.servers.length}
          tone={status.certbot ? "success" : "muted"}
          dimmed={!status.certbot}
          icon={<ShieldCheck className="size-4" />}
          title="certbot"
          badges={
            <ListBadge tone={status.certbot ? "success" : "muted"}>
              {status.certbot || t("server.notInstalled")}
            </ListBadge>
          }
          meta={
            status.certbot
              ? certbotPlugins
                ? t("server.certbotPlugins", { plugins: certbotPlugins })
                : t("server.certbotNoPlugins")
              : t("server.certbotHint")
          }
          trailing={
            canInstall && (!status.certbot || needsPlugin) ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={runner.busy}
                onClick={() =>
                  void runner.run(
                    t("server.installCertbot"),
                    () => installCertbot(hostId),
                    t("server.certbotInstalled"),
                  )
                }
              >
                {t("server.installCertbot")}
              </Button>
            ) : undefined
          }
        />
      </PanelList>
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {[status.os, status.manager !== "none" ? status.manager : ""]
          .filter(Boolean)
          .join(" | ")}
      </p>
    </div>
  );
}
