import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { SPEC_MARK, SPEC_NOTE as NOTE, dropSpec } from "../shared/spec.js";
import type { ServerInfo, SiteSpec } from "../shared/types.js";

export { dropSpec };

const GZIP_TYPES =
  "text/plain text/css text/xml application/javascript application/json application/xml image/svg+xml";

export interface Rendered {
  content: string;
  /** Apache modules the site needs, turned on with a2enmod on Debian. */
  modules: string[];
  /** Ports Apache must listen on. */
  ports: number[];
}

/** The spec kept in the first line of a site file, or null. */
export function readSpec(content: string): SiteSpec | null {
  const first = content.split("\n", 1)[0] ?? "";
  if (!first.startsWith(SPEC_MARK)) return null;
  try {
    const spec = JSON.parse(
      Buffer.from(first.slice(SPEC_MARK.length).trim(), "base64").toString(
        "utf8",
      ),
    ) as SiteSpec;
    return spec && typeof spec === "object" && Array.isArray(spec.names)
      ? spec
      : null;
  } catch {
    return null;
  }
}

function specLine(spec: SiteSpec): string {
  return `${SPEC_MARK}${Buffer.from(JSON.stringify(spec), "utf8").toString("base64")}`;
}

/** Turns the site form into a config file for the server. */
export function renderSite(
  server: ServerInfo,
  name: string,
  spec: SiteSpec,
): Rendered {
  const head = `${specLine(spec)}\n${NOTE}\n`;
  if (server.kind === "nginx") {
    return {
      content: head + nginx(server, name, spec),
      modules: [],
      ports: [],
    };
  }
  if (server.kind === "apache") {
    const out = apache(server, name, spec);
    return { ...out, content: head + out.content };
  }
  return { content: head + caddy(server, name, spec), modules: [], ports: [] };
}

const indent = (lines: string[], pad = "    ") =>
  lines.map((line) => (line ? pad + line : line)).join("\n");

function httpsUrl(spec: SiteSpec, host: string): string {
  return spec.httpsPort === 443
    ? `https://${host}`
    : `https://${host}:${spec.httpsPort}`;
}

function nginx(server: ServerInfo, name: string, spec: SiteSpec): string {
  const names = spec.names.join(" ");
  const logs = spec.accessLog
    ? [
        `access_log ${server.logDir}/${name}.access.log;`,
        `error_log ${server.logDir}/${name}.error.log;`,
      ]
    : ["access_log off;", `error_log ${server.logDir}/${name}.error.log;`];
  const common = [
    ...logs,
    ...(spec.gzip ? ["gzip on;", `gzip_types ${GZIP_TYPES};`] : []),
    ...(spec.maxBodyMb ? [`client_max_body_size ${spec.maxBodyMb}m;`] : []),
  ];

  let body: string[];
  if (spec.type === "static") {
    body = [
      `root ${spec.root};`,
      `index ${spec.index};`,
      "",
      "location / {",
      `    try_files $uri $uri/ ${spec.spa ? "/index.html" : "=404"};`,
      "}",
    ];
  } else if (spec.type === "php") {
    const pass = spec.phpSocket.startsWith("/")
      ? `unix:${spec.phpSocket}`
      : spec.phpSocket;
    body = [
      `root ${spec.root};`,
      `index ${spec.index};`,
      "",
      "location / {",
      "    try_files $uri $uri/ /index.php?$query_string;",
      "}",
      "",
      "location ~ \\.php$ {",
      "    try_files $uri =404;",
      "    fastcgi_split_path_info ^(.+\\.php)(/.+)$;",
      `    fastcgi_pass ${pass};`,
      "    fastcgi_index index.php;",
      "    include fastcgi_params;",
      "    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;",
      "}",
      "",
      "location ~ /\\.ht {",
      "    deny all;",
      "}",
    ];
  } else if (spec.type === "proxy") {
    body = [
      "location / {",
      `    proxy_pass ${spec.upstream};`,
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto $scheme;",
      ...(spec.websockets
        ? [
            "    proxy_set_header Upgrade $http_upgrade;",
            '    proxy_set_header Connection "upgrade";',
            "    proxy_read_timeout 3600s;",
          ]
        : []),
      "}",
    ];
  } else {
    body = [
      `return 301 ${spec.redirectTo}${spec.keepPath ? "$request_uri" : ""};`,
    ];
  }

  const blocks: string[] = [];
  const plain = [`listen ${spec.port};`, `listen [::]:${spec.port};`];
  if (spec.https && spec.forceHttps) {
    const target =
      spec.httpsPort === 443
        ? "https://$host"
        : `https://$host:${spec.httpsPort}`;
    blocks.push(
      `server {\n${indent([
        ...plain,
        `server_name ${names};`,
        "",
        `return 301 ${target}$request_uri;`,
      ])}\n}`,
    );
  } else {
    blocks.push(
      `server {\n${indent([
        ...plain,
        `server_name ${names};`,
        "",
        ...common,
        "",
        ...body,
      ])}\n}`,
    );
  }
  if (spec.https) {
    blocks.push(
      `server {\n${indent([
        `listen ${spec.httpsPort} ssl;`,
        `listen [::]:${spec.httpsPort} ssl;`,
        `server_name ${names};`,
        "",
        `ssl_certificate ${spec.certPath};`,
        `ssl_certificate_key ${spec.keyPath};`,
        "ssl_protocols TLSv1.2 TLSv1.3;",
        "",
        ...common,
        "",
        ...body,
      ])}\n}`,
    );
  }
  return `${blocks.join("\n\n")}\n`;
}

function apache(server: ServerInfo, name: string, spec: SiteSpec): Rendered {
  const modules = new Set<string>();
  const [first, ...aliases] = spec.names;
  const head = [
    `ServerName ${first}`,
    ...(aliases.length ? [`ServerAlias ${aliases.join(" ")}`] : []),
  ];
  const logs = [
    `ErrorLog ${server.logDir}/${name}.error.log`,
    ...(spec.accessLog
      ? [`CustomLog ${server.logDir}/${name}.access.log combined`]
      : []),
  ];
  const common = [
    ...(spec.gzip
      ? [
          "<IfModule mod_deflate.c>",
          `    AddOutputFilterByType DEFLATE text/html ${GZIP_TYPES}`,
          "</IfModule>",
        ]
      : []),
    ...(spec.maxBodyMb
      ? [`LimitRequestBody ${spec.maxBodyMb * 1024 * 1024}`]
      : []),
  ];
  if (spec.gzip) modules.add("deflate");

  let body: string[];
  if (spec.type === "static" || spec.type === "php") {
    body = [
      `DocumentRoot ${spec.root}`,
      `DirectoryIndex ${spec.index}`,
      `<Directory ${spec.root}>`,
      "    Options -Indexes +FollowSymLinks",
      "    AllowOverride All",
      "    Require all granted",
      "</Directory>",
      ...(spec.spa ? ["FallbackResource /index.html"] : []),
    ];
    if (spec.type === "php") {
      const handler = spec.phpSocket.startsWith("/")
        ? `proxy:unix:${spec.phpSocket}|fcgi://localhost`
        : `proxy:fcgi://${spec.phpSocket}`;
      body.push(
        "<FilesMatch \\.php$>",
        `    SetHandler "${handler}"`,
        "</FilesMatch>",
      );
      modules.add("proxy");
      modules.add("proxy_fcgi");
    }
  } else if (spec.type === "proxy") {
    const target = spec.upstream.endsWith("/")
      ? spec.upstream
      : `${spec.upstream}/`;
    body = [
      "ProxyPreserveHost On",
      `ProxyPass / ${target}${spec.websockets ? " upgrade=websocket" : ""}`,
      `ProxyPassReverse / ${target}`,
    ];
    if (spec.upstream.startsWith("https:")) body.unshift("SSLProxyEngine On");
    modules.add("proxy");
    modules.add("proxy_http");
    if (spec.websockets) modules.add("proxy_wstunnel");
  } else {
    body = spec.keepPath
      ? [`Redirect permanent / ${spec.redirectTo}/`]
      : [`RedirectMatch permanent ^ ${spec.redirectTo}`];
    modules.add("alias");
  }

  const blocks: string[] = [];
  const ports = [spec.port];
  if (spec.https && spec.forceHttps) {
    blocks.push(
      `<VirtualHost *:${spec.port}>\n${indent([
        ...head,
        `Redirect permanent / ${httpsUrl(spec, first)}/`,
        ...logs,
      ])}\n</VirtualHost>`,
    );
    modules.add("alias");
  } else {
    blocks.push(
      `<VirtualHost *:${spec.port}>\n${indent([
        ...head,
        ...body,
        ...common,
        ...logs,
      ])}\n</VirtualHost>`,
    );
  }
  if (spec.https) {
    ports.push(spec.httpsPort);
    modules.add("ssl");
    if (spec.type === "proxy") {
      modules.add("headers");
      body.push('RequestHeader set X-Forwarded-Proto "https"');
    }
    blocks.push(
      `<VirtualHost *:${spec.httpsPort}>\n${indent([
        ...head,
        "SSLEngine on",
        `SSLCertificateFile ${spec.certPath}`,
        `SSLCertificateKeyFile ${spec.keyPath}`,
        ...body,
        ...common,
        ...logs,
      ])}\n</VirtualHost>`,
    );
  }
  return {
    content: `${blocks.join("\n\n")}\n`,
    modules: [...modules].sort(),
    ports,
  };
}

function caddyUpstream(upstream: string): string {
  const url = new URL(upstream);
  if (url.pathname !== "/" || url.search) {
    throw new HostScriptError(
      "Caddy can't proxy to a path. Use only the address, like http://127.0.0.1:3000",
    );
  }
  return url.protocol === "https:" ? `https://${url.host}` : url.host;
}

function caddy(server: ServerInfo, name: string, spec: SiteSpec): string {
  const lines: string[] = [];
  if (spec.gzip) lines.push("encode zstd gzip");
  if (spec.maxBodyMb) {
    lines.push("request_body {", `    max_size ${spec.maxBodyMb}MB`, "}");
  }
  if (spec.accessLog) {
    lines.push(
      "log {",
      `    output file ${server.logDir}/${name}.access.log`,
      "}",
    );
  }
  if (spec.type === "static") {
    lines.push(`root * ${spec.root}`);
    if (spec.spa) lines.push("try_files {path} /index.html");
    lines.push("file_server {", `    index ${spec.index}`, "}");
  } else if (spec.type === "php") {
    const socket = spec.phpSocket.startsWith("/")
      ? `unix/${spec.phpSocket}`
      : spec.phpSocket;
    lines.push(`root * ${spec.root}`, `php_fastcgi ${socket}`, "file_server");
  } else if (spec.type === "proxy") {
    lines.push(`reverse_proxy ${caddyUpstream(spec.upstream)}`);
  } else {
    lines.push(
      `redir ${spec.redirectTo}${spec.keepPath ? "{uri}" : ""} permanent`,
    );
  }

  const plainAddr = spec.names
    .map((n) => `http://${n}${spec.port === 80 ? "" : `:${spec.port}`}`)
    .join(", ");
  const tlsAddr = spec.names
    .map((n) => (spec.httpsPort === 443 ? n : `${n}:${spec.httpsPort}`))
    .join(", ");
  const block = (addr: string) => `${addr} {\n${indent(lines)}\n}`;

  if (!spec.https) return `${block(plainAddr)}\n`;
  // Caddy sends plain HTTP on port 80 to HTTPS by itself.
  if (spec.forceHttps) {
    if (spec.port === 80) return `${block(tlsAddr)}\n`;
    return `${block(tlsAddr)}\n\n${plainAddr} {\n    redir https://{host}${spec.httpsPort === 443 ? "" : `:${spec.httpsPort}`}{uri} permanent\n}\n`;
  }
  return `${block(tlsAddr)}\n\n${block(plainAddr)}\n`;
}
