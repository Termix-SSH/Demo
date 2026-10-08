import { get, HttpError, post } from "../../router";
import { sse } from "../../sse";
import { hosts } from "../hosts";

const P = "/plugin-api/proxmox";

type GuestSeed = [
  vmid: number,
  name: string,
  type: "qemu" | "lxc",
  status: string,
  cpu: number,
  memGiB: number,
  diskGiB: number,
  ip: string | null,
];

const GUESTS: GuestSeed[] = [
  [100, "pfsense", "qemu", "running", 4, 2, 32, "192.168.1.2"],
  [101, "home-assistant", "qemu", "running", 9, 4, 64, "192.168.1.30"],
  [102, "win11-gaming", "qemu", "stopped", 0, 16, 256, null],
  [103, "k3s-server", "qemu", "running", 21, 8, 100, "192.168.1.70"],
  [104, "k3s-agent-1", "qemu", "running", 14, 8, 100, "192.168.1.71"],
  [200, "pihole", "lxc", "running", 1, 1, 8, "192.168.1.31"],
  [201, "nginx-proxy", "lxc", "running", 2, 1, 8, "192.168.1.32"],
  [202, "paperless", "lxc", "running", 6, 4, 32, "192.168.1.33"],
  [203, "jellyfin", "lxc", "running", 17, 4, 64, "192.168.1.40"],
  [204, "old-wiki", "lxc", "stopped", 0, 1, 8, "192.168.1.34"],
];

function wave(seed: number, base: number, swing: number) {
  const t = Date.now() / 1000;
  return Math.max(
    0,
    Math.round((base + swing * Math.sin(t / 17 + seed)) * 10) / 10,
  );
}

function snapshot() {
  const guests = GUESTS.map(([vmid, name, type, status, cpu, mem, disk]) => {
    const running = status === "running";
    const memPercent = running ? wave(vmid, 55, 8) : 0;
    return {
      vmid,
      name,
      type,
      status,
      cpuPercent: running ? wave(vmid + 3, cpu, Math.max(1, cpu / 3)) : 0,
      memPercent,
      memUsedGiB: running ? Math.round(mem * memPercent) / 100 : 0,
      memTotalGiB: mem,
      diskPercent: 30 + (vmid % 40),
      diskUsedGiB: Math.round(disk * (0.3 + (vmid % 40) / 100)),
      diskTotalGiB: disk,
      uptimeSeconds: running ? 86400 * (3 + (vmid % 20)) : null,
    };
  });
  const running = guests.filter((g) => g.status === "running").length;
  return {
    node: {
      cpu: {
        percent: wave(1, 41, 9),
        cores: 24,
        load: [2.41, 2.18, 1.97] as [number, number, number],
      },
      memory: { percent: wave(2, 72, 3), usedGiB: 92.4, totalGiB: 128 },
      disk: { percent: 34, usedGiB: 31.6, totalGiB: 93.9 },
      uptime: { seconds: 86400 * 41 + 3600 * 7, formatted: "41d 7h 0m" },
      system: {
        hostname: "pve",
        kernel: "6.14.8-2-pve",
        pveVersion: "pve-manager/9.0.6",
      },
    },
    network: {
      interfaces: [
        {
          name: "vmbr0",
          ip: "192.168.1.10/24",
          state: "UP",
          rxBytes: "1.42 TB",
          txBytes: "388 GB",
        },
        {
          name: "vmbr1",
          ip: "10.10.0.1/24",
          state: "UP",
          rxBytes: "61 GB",
          txBytes: "59 GB",
        },
        {
          name: "enp5s0",
          ip: null,
          state: "UP",
          rxBytes: "1.48 TB",
          txBytes: "447 GB",
        },
        {
          name: "wg0",
          ip: "10.8.0.1/24",
          state: "UNKNOWN",
          rxBytes: "4.1 GB",
          txBytes: "2.2 GB",
        },
      ],
    },
    guests: {
      guests,
      counts: {
        running,
        stopped: guests.length - running,
        total: guests.length,
      },
    },
    storage: {
      pools: [
        {
          name: "local",
          type: "dir",
          active: true,
          enabled: true,
          usedGiB: 31.6,
          totalGiB: 93.9,
          availGiB: 62.3,
          percent: 34,
        },
        {
          name: "local-zfs",
          type: "zfspool",
          active: true,
          enabled: true,
          usedGiB: 612,
          totalGiB: 1780,
          availGiB: 1168,
          percent: 34,
        },
        {
          name: "tank",
          type: "zfspool",
          active: true,
          enabled: true,
          usedGiB: 5480,
          totalGiB: 7270,
          availGiB: 1790,
          percent: 75,
        },
        {
          name: "nas-backups",
          type: "nfs",
          active: true,
          enabled: true,
          usedGiB: 2210,
          totalGiB: 3640,
          availGiB: 1430,
          percent: 61,
        },
      ],
    },
    cluster: {
      clustered: true as const,
      quorate: true,
      clusterName: "homelab",
      nodes: [
        { name: "pve", online: true, local: true, ip: "192.168.1.10" },
        { name: "pve2", online: true, local: false, ip: "192.168.1.11" },
        { name: "pve3", online: false, local: false, ip: "192.168.1.12" },
      ],
    },
    lastChecked: new Date().toISOString(),
  };
}

get(`${P}/stats/:id`, (req) => {
  if (!hosts.find(req.params.id)) {
    throw new HttpError(404, { error: "Host not found" });
  }
  return snapshot();
});
post(`${P}/stats/start/:id`, (req) => ({
  success: true,
  viewerSessionId: `pve-${req.params.id}`,
}));
post(`${P}/stats/stop/:id`, () => ({ success: true }));
post(`${P}/stats/heartbeat`, () => ({ success: true }));
get(`${P}/stats/history/:id`, (req) => {
  const ranges: Record<string, number> = {
    "1h": 3.6e6,
    "6h": 2.16e7,
    "24h": 8.64e7,
    "7d": 6.048e8,
    "30d": 2.592e9,
  };
  const span = ranges[req.query.range ?? "24h"] ?? 8.64e7;
  const to = Date.now();
  const rows = Array.from({ length: 120 }, (_, i) => {
    const ts = to - span + (span * i) / 119;
    const x = ts / 1000;
    return {
      ts: new Date(ts).toISOString(),
      cpu_percent:
        Math.round(
          (41 + 12 * Math.sin(x / 2000) + 4 * Math.sin(x / 300)) * 10,
        ) / 10,
      mem_percent: Math.round((72 + 3 * Math.sin(x / 7000)) * 10) / 10,
      disk_percent: 34,
      net_rx_bytes: Math.round(5e6 * (1 + 0.5 * Math.sin(x / 800))),
      net_tx_bytes: Math.round(1.5e6 * (1 + 0.5 * Math.sin(x / 650))),
    };
  });
  return {
    rows,
    fromTs: new Date(to - span).toISOString(),
    toTs: new Date(to).toISOString(),
  };
});

sse(
  (path) => path.startsWith(`${P}/discover/stream`),
  (send, close) => {
    const total = GUESTS.length;
    let done = 0;
    const timer = setInterval(() => {
      done += 2;
      send("progress", { done: Math.min(done, total), total });
      if (done < total) return;
      clearInterval(timer);
      send("result", {
        guests: GUESTS.map(([vmid, name, type, status, , , , ip]) => ({
          name,
          vmid,
          type,
          node: "pve",
          status,
          ip,
          connectionType: name.startsWith("win") ? "rdp" : "ssh",
          enableDocker: name.startsWith("k3s"),
        })),
        credentialId: 3,
        defaultCredentialId: 3,
        jumpHosts: null,
      });
      close();
    }, 300);
    return () => clearInterval(timer);
  },
);

post(`${P}/import`, (req) => {
  const { hosts: incoming = [] } = req.body as {
    hosts?: Array<Record<string, unknown>>;
  };
  for (const body of incoming) {
    hosts.insert({
      ...body,
      id: hosts.nextId(),
      userId: "demo-user",
      tags: (body.tags as string[]) ?? ["proxmox"],
      folder: (body.folder as string) ?? "Homelab / Proxmox",
      pin: false,
      enableSsh: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pluginSettings: {
        "ssh-terminal": { enableTerminal: true },
        "file-manager": { enableFileManager: true },
      },
    } as never);
  }
  return { success: incoming.length, failed: 0, errors: [] };
});
