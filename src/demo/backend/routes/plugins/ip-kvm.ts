import { del, get, post, put } from "../../router";
import { socket } from "../../sockets";
import { collection } from "../../store";

const P = "/plugin-api/ip-kvm";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const drivers = [
  {
    id: "pikvm",
    defaultPort: 443,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: true,
      paste: true,
      snapshot: true,
    },
    powerActions: ["on", "graceful-shutdown", "off", "reset"],
  },
  {
    id: "nanokvm",
    defaultPort: 80,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: false,
      paste: false,
      snapshot: false,
    },
    powerActions: ["on", "off", "reset"],
  },
  {
    id: "jetkvm",
    defaultPort: 80,
    fields: [{ key: "password", type: "secret", required: true }],
    features: {
      screen: false,
      browserScreen: true,
      power: false,
      media: false,
      paste: false,
      snapshot: false,
    },
    powerActions: [],
  },
];

interface Device extends Record<string, unknown> {
  id: number;
}

const devices = collection<Device>("ip-kvm-devices", () => [
  {
    id: 1,
    hostId: 8,
    name: "NAS PiKVM",
    driver: "pikvm",
    address: "192.168.1.71",
    port: 443,
    options: { scheme: "https", mac: "a8:a1:59:3c:4e:10" },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    reading: {
      at: ago(0),
      model: "Raspberry Pi 4",
      version: "4.89",
      hostname: "pikvm",
      power: "on",
      width: 1920,
      height: 1080,
      signal: true,
    },
  },
  {
    id: 2,
    hostId: null,
    name: "Workshop NanoKVM",
    driver: "nanokvm",
    address: "192.168.1.72",
    port: 80,
    options: { scheme: "http" },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    reading: { at: ago(0), model: "NanoKVM", version: "1.4.1", power: "off" },
  },
  {
    id: 3,
    hostId: null,
    name: "Lab JetKVM",
    driver: "jetkvm",
    address: "192.168.1.73",
    port: 80,
    options: { scheme: "http" },
    hasCa: false,
    pollSeconds: 60,
    status: "down",
    lastError: "Connection timed out",
    lastSeenAt: ago(60 * 5),
    reading: null,
  },
]);

get(`${P}/drivers`, () => ({ drivers }));
get(`${P}/devices`, () => ({ devices: devices.all() }));
post(`${P}/devices`, (req) => {
  const b = req.body as Partial<Device>;
  const device = devices.insert({
    hostId: null,
    name: "KVM",
    driver: "pikvm",
    address: "",
    port: null,
    options: {},
    hasCa: false,
    pollSeconds: 30,
    lastError: null,
    ...b,
    id: devices.nextId(),
    status: "up",
    lastSeenAt: ago(0),
    reading: { at: ago(0), power: "on", signal: true },
  });
  return { device };
});
put(`${P}/devices/:id`, (req) => ({
  device: devices.patch(req.params.id, req.body as Partial<Device>),
}));
del(`${P}/devices/:id`, (req) => {
  devices.remove(req.params.id);
  return { ok: true };
});
post(`${P}/devices/test`, () => ({
  reading: { at: ago(0), model: "Raspberry Pi 4", power: "on", signal: true },
}));
post(`${P}/devices/:id/poll`, (req) => ({
  device: devices.find(req.params.id),
}));
post(`${P}/devices/:id/power`, (req) => {
  const action = (req.body as { action?: string }).action;
  const power =
    action === "off" || action === "graceful-shutdown" ? "off" : "on";
  const d = devices.find(req.params.id);
  if (d?.reading) {
    devices.patch(req.params.id, {
      reading: { ...(d.reading as object), power },
    });
  }
  return { ok: true };
});
post(`${P}/devices/:id/wake`, () => ({ ok: true }));
post(`${P}/devices/:id/paste`, () => ({ ok: true }));
post(`${P}/devices/:id/session`, () => ({ sd: "" }));
get(`${P}/devices/:id/media`, () => ({
  media: {
    images: [
      {
        id: "debian",
        name: "debian-13.1-amd64-netinst.iso",
        size: 754_000_000,
      },
      { id: "rescue", name: "systemrescue-11.iso", size: 1_100_000_000 },
    ],
    mounted: null,
    cdrom: true,
    fromUrl: true,
  },
}));
post(`${P}/devices/:id/media/mount`, () => ({ ok: true }));
post(`${P}/devices/:id/media/eject`, () => ({ ok: true }));
post(`${P}/devices/:id/media/fetch`, () => ({ ok: true }));

// The screen: a text console drawn on a canvas and sent as JPEG frames,
// like a real KVM. Keys typed in the tab show up at the prompt.
const BOOT = [
  "Debian GNU/Linux 13 nas tty1",
  "",
  "nas login: root",
  "Password:",
  "Linux nas 6.12.48-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.12.48-1 x86_64",
  "Last login: Fri Nov  6 21:04:11 UTC 2026 on tty1",
];
const KEYS: Record<string, string> = {
  Space: " ",
  Minus: "-",
  Period: ".",
  Slash: "/",
};

socket("/plugin-ws/ip-kvm/screen", (ws) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext("2d");
  const lines = [...BOOT];
  let typed = "";
  let blink = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const run = (cmd: string) => {
    lines.push(`root@nas:~# ${cmd}`);
    if (cmd === "uptime")
      lines.push(
        " 21:08:52 up 41 days,  2:16,  1 user,  load average: 0.21, 0.18, 0.12",
      );
    else if (cmd === "df -h") {
      lines.push("Filesystem      Size  Used Avail Use% Mounted on");
      lines.push("/dev/sda2       916G  412G  458G  48% /");
      lines.push("tank            7.2T  5.9T  1.3T  82% /srv/share");
    } else if (cmd) lines.push(`${cmd.split(" ")[0]}: done`);
  };

  const draw = () => {
    if (!ctx || ws.closed) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#c8c8c8";
    const shown = [
      ...lines.slice(-28),
      `root@nas:~# ${typed}${blink++ % 4 < 2 ? "_" : ""}`,
    ];
    shown.forEach((text, i) => ctx.fillText(text, 12, 24 + i * 19));
    canvas.toBlob(
      (blob) => void blob?.arrayBuffer().then((buffer) => ws.send(buffer)),
      "image/jpeg",
      0.85,
    );
  };

  ws.onMessage((raw) => {
    let message: {
      type?: string;
      data?: { t?: string; code?: string; down?: boolean };
    };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === "connect") {
      ws.send({ type: "started" });
      draw();
      timer = setInterval(draw, 200);
      return;
    }
    const event = message.data;
    if (message.type !== "input" || event?.t !== "key" || !event.down) return;
    const code = event.code ?? "";
    if (code === "Enter") {
      run(typed.trim());
      typed = "";
    } else if (code === "Backspace") typed = typed.slice(0, -1);
    else if (code.startsWith("Key")) typed += code.slice(3).toLowerCase();
    else if (code.startsWith("Digit")) typed += code.slice(5);
    else if (KEYS[code]) typed += KEYS[code];
    draw();
  });
  ws.onClose(() => {
    if (timer) clearInterval(timer);
  });
});
