import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Layout, ServerInfo, ServerKind } from "../shared/types.js";

/** Where each server keeps its files, by layout. */
export function serverPaths(
  kind: ServerKind,
  layout: Layout,
): Omit<ServerInfo, "installed" | "version" | "state" | "boot"> {
  if (kind === "nginx") {
    return {
      kind,
      unit: "nginx",
      layout,
      root: "/etc/nginx",
      mainFile: "/etc/nginx/nginx.conf",
      siteDir:
        layout === "debian"
          ? "/etc/nginx/sites-available"
          : "/etc/nginx/conf.d",
      enabledDir: layout === "debian" ? "/etc/nginx/sites-enabled" : "",
      logDir: "/var/log/nginx",
    };
  }
  if (kind === "apache") {
    return layout === "debian"
      ? {
          kind,
          unit: "apache2",
          layout,
          root: "/etc/apache2",
          mainFile: "/etc/apache2/apache2.conf",
          siteDir: "/etc/apache2/sites-available",
          enabledDir: "/etc/apache2/sites-enabled",
          logDir: "/var/log/apache2",
        }
      : {
          kind,
          unit: "httpd",
          layout,
          root: "/etc/httpd",
          mainFile: "/etc/httpd/conf/httpd.conf",
          siteDir: "/etc/httpd/conf.d",
          enabledDir: "",
          logDir: "/var/log/httpd",
        };
  }
  return {
    kind,
    unit: "caddy",
    layout: "caddy",
    root: "/etc/caddy",
    mainFile: "/etc/caddy/Caddyfile",
    siteDir: "/etc/caddy/sites",
    enabledDir: "",
    logDir: "/var/log/caddy",
  };
}

export const CADDY_IMPORT = "import /etc/caddy/sites/*.caddy";
/** Keeps the Caddy import valid when no site is on. Hidden from the list. */
export const CADDY_KEEP = "_termix.caddy";

/** Checks the whole config. Prints why it fails. */
export function testCommand(server: ServerInfo): string {
  if (server.kind === "nginx") return "nginx -t";
  if (server.kind === "apache") {
    return server.layout === "debian" ? "apache2ctl -t" : "apachectl -t";
  }
  return `caddy validate --config ${server.mainFile} --adapter caddyfile`;
}

/** Reloads the server, but only when it runs. */
export function reloadCommand(server: ServerInfo): string {
  const unit = server.unit;
  return `if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  if systemctl is-active -q ${unit}; then systemctl reload ${unit} 2>&1 || { echo "SCRIPT_ERR:The config is fine but ${unit} did not reload"; exit 4; }; fi
elif command -v rc-service >/dev/null 2>&1; then
  if rc-service ${unit} status >/dev/null 2>&1; then rc-service ${unit} reload 2>&1 || exit 4; fi
fi`;
}

/** The file name a new site gets. */
export function siteFileName(server: ServerInfo, name: string): string {
  return server.kind === "caddy" ? `${name}.caddy` : `${name}.conf`;
}

/** Every path an existing site may live at, in the order they are tried. */
export function siteCandidates(server: ServerInfo, name: string): string[] {
  const d = server.siteDir;
  if (server.kind === "caddy") {
    return [`${d}/${name}.caddy`, `${d}/${name}.caddy.disabled`];
  }
  if (server.layout === "debian") {
    // nginx on Debian names its first site "default", with no ending.
    return server.kind === "nginx"
      ? [`${d}/${name}.conf`, `${d}/${name}`]
      : [`${d}/${name}.conf`];
  }
  return [`${d}/${name}.conf`, `${d}/${name}.conf.disabled`];
}

/** "default.conf" or "x.caddy.disabled" back to the site name. */
export function siteNameOf(fileName: string): string {
  return fileName.replace(/\.disabled$/, "").replace(/\.(conf|caddy)$/, "");
}

export function requireInstalled(
  servers: ServerInfo[],
  kind: ServerKind,
): ServerInfo {
  const server = servers.find((s) => s.kind === kind);
  if (!server?.installed) {
    throw new HostScriptError(`${label(kind)} is not installed on this host`);
  }
  return server;
}

export function label(kind: ServerKind): string {
  return kind === "nginx" ? "nginx" : kind === "apache" ? "Apache" : "Caddy";
}
