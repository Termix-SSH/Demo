import { get, HttpError, post } from "../../router";
import { value } from "../../store";
import { hosts } from "../hosts";
import { DEMO_OFFLINE_HOSTS } from "../../../fixtures/hosts";
import {
  defaultColSpanFor,
  defaultHeightFor,
  type HostMetricsCardId,
  type HostMetricsLayout,
} from "../../../../plugins/host-metrics/src/shared/host-metrics";

const P = "/plugin-api/host-metrics";

/** Smooth, per-host values that drift over time instead of jumping. */
function wave(hostId: number, salt: number, base: number, swing: number) {
  const t = Date.now() / 1000;
  const phase = hostId * 1.7 + salt * 2.3;
  const v =
    base +
    swing * Math.sin(t / 23 + phase) * 0.6 +
    swing * Math.sin(t / 7 + phase * 1.3) * 0.4;
  return Math.max(1, Math.min(99, Math.round(v * 10) / 10));
}

const PROFILE: Record<
  number,
  { cpu: number; mem: number; disk: number; cores: number; ram: number }
> = {
  1: { cpu: 34, mem: 61, disk: 48, cores: 4, ram: 8 },
  2: { cpu: 28, mem: 54, disk: 41, cores: 4, ram: 8 },
  3: { cpu: 72, mem: 83, disk: 67, cores: 16, ram: 64 },
  4: { cpu: 19, mem: 47, disk: 63, cores: 8, ram: 32 },
  5: { cpu: 11, mem: 38, disk: 22, cores: 2, ram: 4 },
  6: { cpu: 4, mem: 18, disk: 15, cores: 1, ram: 1 },
  7: { cpu: 41, mem: 72, disk: 58, cores: 24, ram: 128 },
  8: { cpu: 9, mem: 31, disk: 81, cores: 4, ram: 16 },
  9: { cpu: 6, mem: 27, disk: 34, cores: 4, ram: 2 },
  12: { cpu: 23, mem: 58, disk: 44, cores: 10, ram: 32 },
  13: { cpu: 15, mem: 44, disk: 29, cores: 2, ram: 4 },
  16: { cpu: 3, mem: 21, disk: 12, cores: 2, ram: 2 },
};

function human(gib: number): string {
  return gib >= 1024 ? `${(gib / 1024).toFixed(1)}T` : `${Math.round(gib)}G`;
}

function metricsFor(hostId: number) {
  const host = hosts.find(hostId);
  const p = PROFILE[hostId] ?? { cpu: 20, mem: 40, disk: 30, cores: 2, ram: 4 };
  const cpu = wave(hostId, 1, p.cpu, 12);
  const mem = wave(hostId, 2, p.mem, 4);
  const diskTotal = hostId === 8 ? 7450 : hostId === 7 ? 1800 : 120;
  const diskPct = p.disk;
  const usedDisk = (diskTotal * diskPct) / 100;
  const t = Date.now() / 1000;
  const uptimeSeconds = 86400 * (12 + (hostId % 9) * 7) + Math.floor(t % 86400);
  const rate = (salt: number, base: number) =>
    Math.round(base * (1 + 0.5 * Math.sin(t / 5 + hostId + salt)));
  const ip = host?.ip ?? "10.0.0.2";
  return {
    cpu: {
      percent: cpu,
      cores: p.cores,
      load: [
        Math.round(p.cores * cpu) / 100,
        Math.round(p.cores * p.cpu * 0.9) / 100,
        Math.round(p.cores * p.cpu * 0.8) / 100,
      ] as [number, number, number],
    },
    memory: {
      percent: mem,
      usedGiB: Math.round(p.ram * mem) / 100,
      totalGiB: p.ram,
    },
    disk: {
      percent: diskPct,
      usedHuman: human(usedDisk),
      totalHuman: human(diskTotal),
      availableHuman: human(diskTotal - usedDisk),
      mount: "/",
      filesystems: [
        {
          filesystem: "/dev/sda1",
          type: "ext4",
          mount: "/",
          percent: diskPct,
          usedHuman: human(usedDisk),
          totalHuman: human(diskTotal),
          availableHuman: human(diskTotal - usedDisk),
          usedBytes: usedDisk * 2 ** 30,
          totalBytes: diskTotal * 2 ** 30,
          availableBytes: (diskTotal - usedDisk) * 2 ** 30,
        },
        {
          filesystem: "/dev/sda15",
          type: "vfat",
          mount: "/boot/efi",
          percent: 6,
          usedHuman: "6.1M",
          totalHuman: "105M",
          availableHuman: "99M",
          usedBytes: 6.1 * 2 ** 20,
          totalBytes: 105 * 2 ** 20,
          availableBytes: 99 * 2 ** 20,
        },
      ],
    },
    network: {
      interfaces: [
        {
          name: "eth0",
          ip,
          state: "UP",
          rxBytes: String(4.2e11 + hostId * 1e9),
          txBytes: String(1.1e11 + hostId * 1e9),
          rxRateBps: rate(0, 2_400_000),
          txRateBps: rate(1, 640_000),
        },
        {
          name: "lo",
          ip: "127.0.0.1",
          state: "UNKNOWN",
          rxRateBps: 1200,
          txRateBps: 1200,
        },
        ...(hostId === 1 || hostId === 13
          ? [
              {
                name: "docker0",
                ip: "172.17.0.1",
                state: "UP",
                rxRateBps: rate(2, 80_000),
                txRateBps: rate(3, 90_000),
              },
            ]
          : []),
      ],
    },
    uptime: {
      seconds: uptimeSeconds,
      formatted: `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    },
    system: {
      hostname: host?.name ?? "host",
      os:
        hostId === 7
          ? "Proxmox VE 9.0"
          : hostId === 12
            ? "macOS 15.6"
            : "Ubuntu 24.04.3 LTS",
      kernel: hostId === 12 ? "Darwin 24.6.0" : "6.8.0-79-generic",
      arch: hostId === 9 ? "aarch64" : "x86_64",
    },
    processes: {
      total: 180 + hostId * 7,
      running: 2 + (hostId % 4),
      top: [
        {
          pid: "1423",
          user: hostId === 3 ? "postgres" : "www-data",
          cpu: String(Math.round(cpu * 0.45)),
          mem: "12.4",
          command:
            hostId === 3 ? "postgres: checkpointer" : "nginx: worker process",
        },
        {
          pid: "882",
          user: "root",
          cpu: String(Math.round(cpu * 0.2)),
          mem: "4.1",
          command: "dockerd",
        },
        {
          pid: "2210",
          user: "root",
          cpu: "1.2",
          mem: "2.6",
          command: "node /srv/app/server.js",
        },
        {
          pid: "611",
          user: "root",
          cpu: "0.4",
          mem: "0.9",
          command: "sshd: deploy [priv]",
        },
        {
          pid: "1",
          user: "root",
          cpu: "0.1",
          mem: "0.3",
          command: "/sbin/init",
        },
      ],
    },
    login_stats: {
      recentLogins: [
        {
          user: host?.username ?? "root",
          ip: "10.0.0.24",
          time: new Date(Date.now() - 6e5).toISOString(),
          status: "success" as const,
        },
        {
          user: host?.username ?? "root",
          ip: "10.0.0.31",
          time: new Date(Date.now() - 7.2e6).toISOString(),
          status: "success" as const,
        },
      ],
      failedLogins: [
        {
          user: "admin",
          ip: "203.0.113.45",
          time: new Date(Date.now() - 3.6e6).toISOString(),
          status: "failed" as const,
        },
        {
          user: "test",
          ip: "198.51.100.7",
          time: new Date(Date.now() - 9.4e6).toISOString(),
          status: "failed" as const,
        },
      ],
      totalLogins: 148,
      uniqueIPs: 6,
    },
    ports: {
      source: "ss" as const,
      ports: [
        {
          protocol: "tcp" as const,
          localAddress: "0.0.0.0",
          localPort: 22,
          state: "LISTEN",
          pid: 611,
          process: "sshd",
        },
        {
          protocol: "tcp" as const,
          localAddress: "0.0.0.0",
          localPort: 80,
          state: "LISTEN",
          pid: 1420,
          process: "nginx",
        },
        {
          protocol: "tcp" as const,
          localAddress: "0.0.0.0",
          localPort: 443,
          state: "LISTEN",
          pid: 1420,
          process: "nginx",
        },
        {
          protocol: "tcp" as const,
          localAddress: "127.0.0.1",
          localPort: 5432,
          state: "LISTEN",
          pid: 1300,
          process: "postgres",
        },
        {
          protocol: "udp" as const,
          localAddress: "0.0.0.0",
          localPort: 51820,
          process: "wireguard",
        },
      ],
    },
    firewall: {
      type: "nftables" as const,
      status: "active" as const,
      chains: [
        {
          name: "INPUT",
          policy: "DROP",
          rules: [
            {
              chain: "INPUT",
              target: "ACCEPT",
              protocol: "tcp",
              source: "0.0.0.0/0",
              destination: "0.0.0.0/0",
              dport: "22",
            },
            {
              chain: "INPUT",
              target: "ACCEPT",
              protocol: "tcp",
              source: "0.0.0.0/0",
              destination: "0.0.0.0/0",
              dport: "80,443",
            },
            {
              chain: "INPUT",
              target: "ACCEPT",
              protocol: "all",
              source: "0.0.0.0/0",
              destination: "0.0.0.0/0",
              state: "RELATED,ESTABLISHED",
            },
          ],
        },
        { name: "FORWARD", policy: "DROP", rules: [] },
        { name: "OUTPUT", policy: "ACCEPT", rules: [] },
      ],
    },
    temperature: {
      source: "sensors" as const,
      highestCelsius: Math.round(wave(hostId, 4, 52, 6)),
      sensors: [
        { label: "Package id 0", celsius: Math.round(wave(hostId, 4, 52, 6)) },
        { label: "Core 0", celsius: Math.round(wave(hostId, 5, 49, 6)) },
        { label: "Core 1", celsius: Math.round(wave(hostId, 6, 50, 6)) },
        { label: "nvme0", celsius: 41 },
      ],
    },
    gpu:
      hostId === 7 || hostId === 10
        ? {
            source: "nvidia-smi" as const,
            gpus: [
              {
                index: 0,
                uuid: "GPU-demo-0",
                name:
                  hostId === 7 ? "NVIDIA RTX A4000" : "NVIDIA GeForce RTX 3060",
                driverVersion: "570.172.08",
                utilizationPercent: wave(hostId, 7, 38, 20),
                memoryUsedMiB: 6120,
                memoryTotalMiB: hostId === 7 ? 16376 : 12288,
                memoryPercent: hostId === 7 ? 37 : 50,
                temperatureCelsius: Math.round(wave(hostId, 8, 58, 5)),
                powerDrawWatts: 71,
                powerLimitWatts: 140,
                fanPercent: 34,
              },
            ],
            processes: [
              {
                gpuIndex: 0,
                pid: 4410,
                name: hostId === 7 ? "ollama" : "Plex Transcoder",
                memoryUsedMiB: 5800,
              },
            ],
          }
        : { source: "none" as const, gpus: [], processes: [] },
    lastChecked: new Date().toISOString(),
  };
}

function checkHost(id: string) {
  const host = hosts.find(id);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  if (
    DEMO_OFFLINE_HOSTS.has(Number(id)) ||
    host.pluginSettings?.["host-metrics"]?.metricsEnabled === false
  ) {
    throw new HttpError(404, { error: "Metrics not available" });
  }
  return host;
}

get(`${P}/metrics/:id`, (req) => {
  checkHost(req.params.id);
  return metricsFor(Number(req.params.id));
});
post(`${P}/metrics/start/:id`, (req) => {
  if (DEMO_OFFLINE_HOSTS.has(Number(req.params.id))) {
    throw new HttpError(500, {
      error: "Connection timed out",
      connectionLogs: [
        { type: "info", stage: "connect", message: "Connecting to host" },
        {
          type: "error",
          stage: "connect",
          message: "Timed out after 30s. The host did not answer.",
        },
      ],
    });
  }
  return {
    success: true,
    viewerSessionId: `viewer-${req.params.id}`,
    connectionLogs: [
      { type: "info", stage: "connect", message: "Connecting to host" },
      { type: "success", stage: "auth", message: "Authenticated" },
      { type: "success", stage: "ready", message: "Collecting metrics" },
    ],
  };
});
post(`${P}/metrics/stop/:id`, () => ({ success: true }));
post(`${P}/metrics/heartbeat`, () => ({ success: true }));
post(`${P}/metrics/register-viewer`, (req) => ({
  success: true,
  viewerSessionId: `viewer-${(req.body as { hostId: number }).hostId}`,
}));
post(`${P}/metrics/unregister-viewer`, () => ({ success: true }));
get(`${P}/metrics/history/:id`, (req) => {
  const id = Number(req.params.id);
  const ranges: Record<string, number> = {
    "1h": 3.6e6,
    "6h": 2.16e7,
    "24h": 8.64e7,
    "7d": 6.048e8,
    "30d": 2.592e9,
  };
  const span = ranges[req.query.range ?? "24h"] ?? 8.64e7;
  const to = Date.now();
  const from = to - span;
  const points = 120;
  const p = PROFILE[id] ?? { cpu: 20, mem: 40, disk: 30 };
  const rows = Array.from({ length: points }, (_, i) => {
    const ts = from + (span * i) / (points - 1);
    const x = ts / 1000;
    return {
      ts: new Date(ts).toISOString(),
      cpu_percent: Math.max(
        1,
        Math.round(
          (p.cpu + 14 * Math.sin(x / 1800 + id) + 6 * Math.sin(x / 300)) * 10,
        ) / 10,
      ),
      mem_percent: Math.round((p.mem + 3 * Math.sin(x / 5400 + id)) * 10) / 10,
      disk_percent: p.disk,
      net_rx_bytes: Math.round(2e6 * (1 + 0.6 * Math.sin(x / 900 + id))),
      net_tx_bytes: Math.round(6e5 * (1 + 0.6 * Math.sin(x / 700 + id))),
    };
  });
  return {
    rows,
    fromTs: new Date(from).toISOString(),
    toTs: new Date(to).toISOString(),
  };
});
get(`${P}/host-metrics/platform/:id`, () => ({
  hasSystemd: true,
  pkg: "apt",
  hasCertbot: true,
  hasAcmeSh: false,
  hasDocker: true,
  osPrettyName: "Ubuntu 24.04.3 LTS",
}));

// A layout that shows off both metric and manager cards.
const SHOWCASE: HostMetricsCardId[] = [
  "cpu",
  "memory",
  "disk",
  "network",
  "uptime",
  "system",
  "processes",
  "temperature",
  "gpu",
  "service_manager",
  "login_stats",
  "ports",
  "log_viewer",
  "health_check",
  "firewall",
  "package_manager",
  "cron_manager",
];
function showcaseLayout(hostId: number): HostMetricsLayout {
  const ids = SHOWCASE.filter(
    (id) => id !== "gpu" || hostId === 7 || hostId === 10,
  );
  return {
    columns: 3,
    slots: ids.map((id, order) => ({
      id,
      order,
      colSpan: defaultColSpanFor(id),
      height: defaultHeightFor(id),
    })),
  };
}
const layouts = value<Record<string, HostMetricsLayout>>(
  "metrics-layouts",
  () => ({}),
);
get(`${P}/host-metrics/preferences/:id`, (req) => ({
  layout: layouts.get()[req.params.id] ?? showcaseLayout(Number(req.params.id)),
}));
post(`${P}/host-metrics/preferences/:id`, (req) => {
  layouts.update((all) => ({
    ...all,
    [req.params.id]: req.body as HostMetricsLayout,
  }));
  return { success: true };
});

// Manager cards
const now = Date.now();
const managers: Record<string, (hostId: number) => unknown> = {
  services: () => ({
    services: [
      [
        "nginx.service",
        "active",
        "running",
        "A high performance web server and a reverse proxy server",
      ],
      [
        "docker.service",
        "active",
        "running",
        "Docker Application Container Engine",
      ],
      ["ssh.service", "active", "running", "OpenBSD Secure Shell server"],
      [
        "postgresql@16-main.service",
        "active",
        "running",
        "PostgreSQL Cluster 16-main",
      ],
      ["fail2ban.service", "active", "running", "Fail2Ban Service"],
      [
        "cron.service",
        "active",
        "running",
        "Regular background program processing daemon",
      ],
      [
        "unattended-upgrades.service",
        "active",
        "running",
        "Unattended Upgrades Shutdown",
      ],
      ["node-exporter.service", "failed", "failed", "Prometheus Node Exporter"],
      ["snapd.service", "inactive", "dead", "Snap Daemon"],
    ].map(([unit, active, sub, description]) => ({
      unit,
      active,
      sub,
      description,
    })),
  }),
  processes: (hostId) => ({
    processes: metricsFor(hostId).processes.top.map((p, i) => ({
      pid: Number(p.pid),
      ppid: i === 4 ? 0 : 1,
      user: p.user,
      cpu: Number(p.cpu),
      mem: Number(p.mem),
      command: p.command.split(" ")[0],
      args: p.command,
    })),
  }),
  "top-memory": (hostId) => ({
    processes: metricsFor(hostId).processes.top.map((p) => ({
      pid: Number(p.pid),
      user: p.user,
      mem: Number(p.mem),
      rss: Math.round(Number(p.mem) * 81920),
      command: p.command,
    })),
  }),
  timers: () => ({
    timers: [
      {
        unit: "apt-daily.timer",
        activates: "apt-daily.service",
        next: "in 3h 12min",
      },
      {
        unit: "certbot.timer",
        activates: "certbot.service",
        next: "in 9h 40min",
      },
      {
        unit: "logrotate.timer",
        activates: "logrotate.service",
        next: "in 14h",
      },
      { unit: "fstrim.timer", activates: "fstrim.service", next: "in 2 days" },
    ],
  }),
  "disk-breakdown": () => ({
    mounts: [
      {
        filesystem: "/dev/sda1",
        usePct: 48,
        usedKb: 57_671_680,
        sizeKb: 120_152_064,
        mount: "/",
      },
      {
        filesystem: "/dev/sdb1",
        usePct: 81,
        usedKb: 6_325_000_000,
        sizeKb: 7_812_500_000,
        mount: "/srv/data",
      },
      {
        filesystem: "tmpfs",
        usePct: 1,
        usedKb: 1024,
        sizeKb: 819_200,
        mount: "/run",
      },
    ],
  }),
  cron: () => ({
    entries: [
      {
        raw: "0 3 * * * /usr/local/bin/backup.sh",
        enabled: true,
        schedule: "0 3 * * *",
        command: "/usr/local/bin/backup.sh",
      },
      {
        raw: "*/5 * * * * /opt/healthcheck/ping",
        enabled: true,
        schedule: "*/5 * * * *",
        command: "/opt/healthcheck/ping",
      },
      {
        raw: "# 30 2 * * 0 /usr/bin/certbot renew",
        enabled: false,
        schedule: "30 2 * * 0",
        command: "/usr/bin/certbot renew",
      },
    ],
  }),
  packages: () => ({
    pkg: "apt",
    upgradable: [
      {
        name: "openssl",
        currentVersion: "3.0.13-0ubuntu3.5",
        newVersion: "3.0.13-0ubuntu3.6",
      },
      {
        name: "nginx",
        currentVersion: "1.24.0-2ubuntu7.4",
        newVersion: "1.24.0-2ubuntu7.5",
      },
      {
        name: "linux-image-generic",
        currentVersion: "6.8.0.79.79",
        newVersion: "6.8.0.83.83",
      },
      {
        name: "curl",
        currentVersion: "8.5.0-2ubuntu10.6",
        newVersion: "8.5.0-2ubuntu10.7",
      },
    ],
  }),
  ssl: () => ({
    clients: { certbot: true, acmeSh: false },
    certs: [
      {
        client: "certbot",
        name: "example.home.arpa",
        domains: ["example.home.arpa", "www.example.home.arpa"],
        expiry: new Date(now + 64 * 864e5).toISOString(),
      },
      {
        client: "certbot",
        name: "grafana.home.arpa",
        domains: ["grafana.home.arpa"],
        expiry: new Date(now + 9 * 864e5).toISOString(),
      },
    ],
  }),
  firewall: (hostId) => ({
    ...metricsFor(hostId).firewall,
    type: "nftables",
    status: "active",
  }),
  users: () => ({
    users: [
      { name: "root", uid: 0, shell: "/bin/bash" },
      { name: "deploy", uid: 1000, shell: "/bin/bash" },
      { name: "postgres", uid: 113, shell: "/bin/bash" },
      { name: "backup", uid: 1001, shell: "/usr/sbin/nologin" },
    ],
    sudoers: ["root", "deploy"],
  }),
  health: () => ({
    checks: [
      {
        id: "web",
        name: "Public site",
        type: "http",
        target: "https://example.home.arpa",
        path: "/",
      },
      {
        id: "db",
        name: "Postgres",
        type: "tcp",
        target: "10.0.12.40",
        port: 5432,
      },
      {
        id: "exporter",
        name: "Node exporter",
        type: "tcp",
        target: "127.0.0.1",
        port: 9100,
      },
    ],
    results: [
      { checkId: "web", ok: true, latencyMs: 84, detail: "200 OK" },
      { checkId: "db", ok: true, latencyMs: 3, detail: "Connected" },
      {
        checkId: "exporter",
        ok: false,
        latencyMs: null,
        detail: "Connection refused",
      },
    ],
    history: Array.from({ length: 24 }, (_, i) => [
      {
        checkId: "web",
        ts: new Date(now - i * 3.6e6).toISOString(),
        ok: true,
        latencyMs: 70 + (i % 5) * 9,
      },
      {
        checkId: "db",
        ts: new Date(now - i * 3.6e6).toISOString(),
        ok: true,
        latencyMs: 2 + (i % 3),
      },
      {
        checkId: "exporter",
        ts: new Date(now - i * 3.6e6).toISOString(),
        ok: i > 3,
        latencyMs: i > 3 ? 1 : null,
      },
    ]).flat(),
  }),
  wireguard: () => ({
    installed: true,
    interfaces: [
      {
        name: "wg0",
        publicKey: "uK5bZ9DemoOnlyPublicKeyForWireGuardIfaceAAA=",
        listenPort: 51820,
        up: true,
        peers: [
          {
            publicKey: "Pq2DemoPeerLaptopKeyAAAAAAAAAAAAAAAAAAAAAA=",
            endpoint: "198.51.100.22:51820",
            allowedIPs: ["10.8.0.2/32"],
            latestHandshake: Math.floor(now / 1000) - 42,
            rxBytes: 182_000_000,
            txBytes: 41_000_000,
          },
          {
            publicKey: "Zr7DemoPeerPhoneKeyAAAAAAAAAAAAAAAAAAAAAAA=",
            endpoint: null,
            allowedIPs: ["10.8.0.3/32"],
            latestHandshake: Math.floor(now / 1000) - 86_400,
            rxBytes: 9_100_000,
            txBytes: 2_300_000,
          },
        ],
      },
    ],
  }),
};

const LOG_LINES = [
  "systemd[1]: Started nginx.service - A high performance web server.",
  "sshd[611]: Accepted publickey for deploy from 10.0.0.24 port 51522 ssh2: ED25519",
  "kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.45 DST=10.0.12.21 PROTO=TCP DPT=23",
  "CRON[2201]: (root) CMD (/opt/healthcheck/ping)",
  'dockerd[882]: level=info msg="Container health status changed" status=healthy',
  "sshd[2299]: Invalid user admin from 203.0.113.45 port 40122",
  "systemd[1]: Starting apt-daily.service - Daily apt download activities...",
];
get(`${P}/host-metrics/managers/logs/:id/files`, () => ({
  common: ["/var/log/syslog", "/var/log/auth.log", "/var/log/nginx/access.log"],
  files: ["/var/log/kern.log", "/var/log/dpkg.log"],
}));
get(`${P}/host-metrics/managers/logs/:id`, () => {
  const t = Date.now();
  const lines = Array.from({ length: 40 }, (_, i) => {
    const ts = new Date(t - (40 - i) * 47_000);
    const stamp = ts.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${stamp} web-01 ${LOG_LINES[i % LOG_LINES.length]}`;
  });
  return { content: lines.join("\n") };
});
get(`${P}/host-metrics/managers/:resource/:id`, (req) => {
  const make = managers[req.params.resource];
  if (!make) throw new HttpError(404, { error: "Not available in the demo" });
  return make(Number(req.params.id));
});
post(`${P}/host-metrics/managers/:resource/:id`, () => ({
  success: true,
  output: "Done. This is a demo, so nothing changed on a real host.",
}));
post(`${P}/host-metrics/managers/:resource/:id/:action`, () => ({
  success: true,
  output: "Done. This is a demo, so nothing changed on a real host.",
}));
