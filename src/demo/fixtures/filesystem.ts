/**
 * One small Linux tree that the terminal and the file manager both walk.
 * Paths map to directory entries; file bodies live in CONTENTS.
 */

export interface FsEntry {
  name: string;
  type: "file" | "directory" | "link";
  size: number;
  mode: string;
  owner: string;
  group: string;
  modified: string;
  target?: string;
}

const day = 864e5;
const stamp = (daysAgo: number) =>
  new Date(Date.UTC(2026, 9, 8, 9, 30) - daysAgo * day).toISOString();

function d(name: string, owner = "root", daysAgo = 30): FsEntry {
  return {
    name,
    type: "directory",
    size: 4096,
    mode: "drwxr-xr-x",
    owner,
    group: owner,
    modified: stamp(daysAgo),
  };
}
function f(
  name: string,
  size: number,
  owner = "root",
  mode = "-rw-r--r--",
  daysAgo = 12,
): FsEntry {
  return {
    name,
    type: "file",
    size,
    mode,
    owner,
    group: owner,
    modified: stamp(daysAgo),
  };
}
function l(name: string, target: string, owner = "root"): FsEntry {
  return {
    name,
    type: "link",
    size: target.length,
    mode: "lrwxrwxrwx",
    owner,
    group: owner,
    modified: stamp(5),
    target,
  };
}

export const CONTENTS: Record<string, string> = {
  "/etc/hosts":
    "127.0.0.1\tlocalhost\n127.0.1.1\tweb-01\n10.0.12.40\tdb-primary\n10.0.12.41\tdb-replica\n10.0.12.2\tbastion\n",
  "/etc/hostname": "web-01\n",
  "/etc/os-release":
    'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.3 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n',
  "/etc/nginx/nginx.conf":
    "user www-data;\nworker_processes auto;\npid /run/nginx.pid;\n\nevents {\n    worker_connections 1024;\n}\n\nhttp {\n    sendfile on;\n    tcp_nopush on;\n    types_hash_max_size 2048;\n    server_tokens off;\n\n    include /etc/nginx/mime.types;\n    default_type application/octet-stream;\n\n    access_log /var/log/nginx/access.log;\n    error_log /var/log/nginx/error.log;\n\n    gzip on;\n\n    include /etc/nginx/sites-enabled/*;\n}\n",
  "/etc/nginx/sites-enabled/app.conf":
    "server {\n    listen 443 ssl http2;\n    server_name example.home.arpa;\n\n    ssl_certificate /etc/letsencrypt/live/example.home.arpa/fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/live/example.home.arpa/privkey.pem;\n\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    }\n}\n",
  "/home/deploy/notes.md":
    "# Deploy notes\n\n- Releases live in `~/releases`, symlinked as `current`.\n- Run the smoke test before flipping the symlink.\n- `db-primary` must not restart during business hours.\n\n## Rollback\n\n```bash\nln -sfn ~/releases/2026-10-01 ~/releases/current\nsudo systemctl reload nginx\n```\n",
  "/home/deploy/deploy.sh":
    '#!/usr/bin/env bash\nset -euo pipefail\n\nRELEASE="$(date +%F)"\nmkdir -p ~/releases/"$RELEASE"\ntar -xzf app.tar.gz -C ~/releases/"$RELEASE"\nln -sfn ~/releases/"$RELEASE" ~/releases/current\nsudo systemctl reload nginx\necho "Deployed $RELEASE"\n',
  "/home/deploy/.bashrc":
    "# ~/.bashrc\nexport EDITOR=vim\nalias ll='ls -alF'\nalias gs='git status'\n",
  "/home/deploy/docker-compose.yml":
    'services:\n  app:\n    image: ghcr.io/example/app:2.4.1\n    restart: unless-stopped\n    ports:\n      - "3000:3000"\n    environment:\n      DATABASE_URL: postgres://app@db-primary/app\n  redis:\n    image: redis:7-alpine\n    restart: unless-stopped\n',
  "/home/deploy/releases/2026-10-08/manifest.json":
    '{\n  "version": "2.4.1",\n  "commit": "9f3c2e1",\n  "builtAt": "2026-10-08T07:12:44Z"\n}\n',
  "/opt/termix/config.yml":
    "server:\n  port: 8080\n  host: 0.0.0.0\n\ndatabase:\n  dialect: sqlite\n  path: /opt/termix/data/termix.db\n",
  "/var/log/nginx/access.log":
    '10.0.0.24 - - [08/Oct/2026:09:12:01 +0000] "GET / HTTP/2.0" 200 5120 "-" "Mozilla/5.0"\n10.0.0.24 - - [08/Oct/2026:09:12:02 +0000] "GET /api/health HTTP/2.0" 200 17 "-" "curl/8.5.0"\n203.0.113.45 - - [08/Oct/2026:09:14:40 +0000] "GET /wp-login.php HTTP/1.1" 404 162 "-" "Mozilla/5.0"\n',
  "/srv/app/README.md":
    "# App\n\nThe public site. Built and shipped by `~/deploy.sh`.\n",
};

export const TREE: Record<string, FsEntry[]> = {
  "/": [
    d("bin"),
    d("boot"),
    d("etc"),
    d("home"),
    d("opt"),
    d("root"),
    d("srv"),
    d("tmp"),
    d("usr"),
    d("var"),
  ],
  "/bin": [
    f("bash", 1446024, "root", "-rwxr-xr-x"),
    f("ls", 142312, "root", "-rwxr-xr-x"),
    f("cat", 35280, "root", "-rwxr-xr-x"),
  ],
  "/boot": [
    f("vmlinuz-6.8.0-79-generic", 14_982_536, "root", "-rw-------"),
    f("initrd.img-6.8.0-79-generic", 71_212_032),
  ],
  "/etc": [
    d("nginx"),
    d("systemd"),
    d("ssh"),
    f("hosts", 132),
    f("hostname", 7),
    f("os-release", 386),
    f("fstab", 657),
  ],
  "/etc/nginx": [
    d("sites-enabled"),
    f("nginx.conf", 1490),
    f("mime.types", 5349),
  ],
  "/etc/nginx/sites-enabled": [f("app.conf", 402)],
  "/etc/systemd": [d("system")],
  "/etc/systemd/system": [f("app.service", 389)],
  "/etc/ssh": [f("sshd_config", 3254)],
  "/home": [d("deploy", "deploy", 90)],
  "/home/deploy": [
    d(".ssh", "deploy", 90),
    d("releases", "deploy", 1),
    f(".bashrc", 3771, "deploy", "-rw-r--r--", 60),
    f("deploy.sh", 1840, "deploy", "-rwxr-xr-x", 3),
    f("docker-compose.yml", 412, "deploy", "-rw-r--r--", 4),
    f("notes.md", 620, "deploy", "-rw-r--r--", 2),
    f("backup-2026-10-07.tar.gz", 248_819_712, "deploy", "-rw-r--r--", 1),
  ],
  "/home/deploy/.ssh": [
    f("authorized_keys", 742, "deploy", "-rw-------", 60),
    f("known_hosts", 2210, "deploy", "-rw-r--r--", 9),
  ],
  "/home/deploy/releases": [
    d("2026-10-08", "deploy", 0),
    d("2026-10-01", "deploy", 7),
    l("current", "/home/deploy/releases/2026-10-08", "deploy"),
  ],
  "/home/deploy/releases/2026-10-08": [
    f("app.tar.gz", 18_904_233, "deploy", "-rw-r--r--", 0),
    f("manifest.json", 96, "deploy", "-rw-r--r--", 0),
  ],
  "/home/deploy/releases/2026-10-01": [
    f("app.tar.gz", 18_220_119, "deploy", "-rw-r--r--", 7),
  ],
  "/opt": [d("termix")],
  "/opt/termix": [d("data"), f("config.yml", 151)],
  "/opt/termix/data": [f("termix.db", 4_194_304, "root", "-rw-------", 0)],
  "/root": [f(".bashrc", 3106, "root", "-rw-r--r--", 120)],
  "/srv": [d("app", "www-data")],
  "/srv/app": [
    d("public", "www-data"),
    f("README.md", 86, "www-data"),
    f("server.js", 4210, "www-data"),
  ],
  "/srv/app/public": [
    f("index.html", 5120, "www-data"),
    f("logo.svg", 2210, "www-data"),
  ],
  "/tmp": [],
  "/usr": [d("bin"), d("lib"), d("share")],
  "/usr/bin": [],
  "/usr/lib": [],
  "/usr/share": [],
  "/var": [d("log"), d("lib"), d("www")],
  "/var/log": [
    d("nginx"),
    f("syslog", 1_204_221, "syslog", "-rw-r-----", 0),
    f("auth.log", 88_412, "syslog", "-rw-r-----", 0),
  ],
  "/var/log/nginx": [
    f("access.log", 412_220, "www-data", "-rw-r-----", 0),
    f("error.log", 2_011, "www-data", "-rw-r-----", 0),
  ],
  "/var/lib": [],
  "/var/www": [],
};

export function homeFor(username: string): string {
  if (username === "root") return "/root";
  return TREE[`/home/${username}`] ? `/home/${username}` : "/home/deploy";
}

export function normalize(cwd: string, arg: string): string {
  if (!arg || arg === ".") return cwd;
  const raw = arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
