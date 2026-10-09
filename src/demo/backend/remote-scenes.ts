/**
 * Still frames for the remote desktop demo, drawn in the page and sent to the
 * real Guacamole client as PNG instructions.
 */

export type SceneKind = "windows" | "mac" | "console";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clock(): { time: string; date: string } {
  const now = new Date();
  return {
    time: now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
    date: now.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    }),
  };
}

function drawWindows(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0a1f44");
  bg.addColorStop(0.55, "#12408a");
  bg.addColorStop(1, "#1d6fd1");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const bloom = ctx.createRadialGradient(
    w * 0.62,
    h * 0.55,
    10,
    w * 0.62,
    h * 0.55,
    h * 0.6,
  );
  bloom.addColorStop(0, "rgba(120,190,255,0.55)");
  bloom.addColorStop(1, "rgba(120,190,255,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  // Desktop icons
  const icons = ["Recycle Bin", "This PC", "Termix", "Projects"];
  ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  icons.forEach((label, i) => {
    const x = 24;
    const y = 20 + i * 92;
    ctx.fillStyle = i === 2 ? "#f39044" : i === 3 ? "#f2c94c" : "#dfe8f7";
    roundRect(ctx, x + 10, y, 44, 40, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 32, y + 58);
  });
  ctx.textAlign = "left";

  // File Explorer window
  const wx = Math.round(w * 0.16);
  const wy = Math.round(h * 0.1);
  const ww = Math.round(Math.min(w * 0.62, 980));
  const wh = Math.round(Math.min(h * 0.68, 560));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, wx + 4, wy + 8, ww, wh, 10);
  ctx.fill();
  ctx.fillStyle = "#202020";
  roundRect(ctx, wx, wy, ww, wh, 8);
  ctx.fill();
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(wx, wy + 8, ww, 34);
  roundRect(ctx, wx, wy, ww, 40, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "13px Segoe UI, Arial, sans-serif";
  ctx.fillText("File Explorer", wx + 16, wy + 25);
  ctx.fillStyle = "#cfcfcf";
  ctx.fillText("-", wx + ww - 120, wy + 25);
  ctx.fillText("□", wx + ww - 76, wy + 25);
  ctx.fillText("✕", wx + ww - 32, wy + 25);
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(wx, wy + 40, 190, wh - 40);
  const side = [
    "Home",
    "Desktop",
    "Documents",
    "Downloads",
    "Pictures",
    "This PC",
    "Network",
  ];
  side.forEach((label, i) => {
    if (i === 2) {
      ctx.fillStyle = "#2d2d2d";
      ctx.fillRect(wx + 6, wy + 54 + i * 32, 178, 28);
    }
    ctx.fillStyle = "#e6e6e6";
    ctx.fillText(label, wx + 22, wy + 73 + i * 32);
  });
  ctx.fillStyle = "#9a9a9a";
  ctx.fillText("Documents", wx + 210, wy + 68);
  const files = [
    "Invoices",
    "Taxes 2026",
    "Server notes",
    "Backups",
    "Photos",
    "Scripts",
    "budget.xlsx",
    "ssh-keys.txt",
  ];
  files.forEach((label, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const fx = wx + 220 + col * 150;
    const fy = wy + 96 + row * 130;
    ctx.fillStyle = label.includes(".") ? "#4a90d9" : "#f2c94c";
    roundRect(ctx, fx + 22, fy, 72, label.includes(".") ? 72 : 56, 6);
    ctx.fill();
    ctx.fillStyle = "#e6e6e6";
    ctx.textAlign = "center";
    ctx.fillText(label, fx + 58, fy + 96);
    ctx.textAlign = "left";
  });

  // Taskbar
  ctx.fillStyle = "rgba(28,28,28,0.94)";
  ctx.fillRect(0, h - 48, w, 48);
  const center = w / 2;
  const apps = [
    "#3b82f6",
    "#e6e6e6",
    "#f2c94c",
    "#2fa0f2",
    "#f39044",
    "#4ade80",
  ];
  apps.forEach((color, i) => {
    const x = center - (apps.length * 44) / 2 + i * 44;
    if (i === 0) {
      ctx.fillStyle = color;
      for (const [dx, dy] of [
        [0, 0],
        [11, 0],
        [0, 11],
        [11, 11],
      ])
        ctx.fillRect(x + 11 + dx, h - 35 + dy, 10, 10);
      return;
    }
    ctx.fillStyle = color;
    roundRect(ctx, x + 10, h - 37, 24, 24, 5);
    ctx.fill();
    if (i === 2) {
      ctx.fillStyle = "#9cc3ff";
      ctx.fillRect(x + 17, h - 6, 10, 3);
    }
  });
  const { time, date } = clock();
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(time, w - 16, h - 28);
  ctx.fillText(date, w - 16, h - 12);
  ctx.textAlign = "left";
}

function drawMac(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#2a1b4d");
  bg.addColorStop(0.5, "#7b3c8c");
  bg.addColorStop(1, "#f08a5d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(20,20,24,0.55)";
  ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("", 16, 18);
  ctx.fillText("Terminal", 44, 18);
  ctx.font = "13px -apple-system, Helvetica, Arial, sans-serif";
  ["Shell", "Edit", "View", "Window", "Help"].forEach((m, i) =>
    ctx.fillText(m, 120 + i * 60, 18),
  );
  const { time } = clock();
  ctx.textAlign = "right";
  ctx.fillText(`Thu  ${time}`, w - 16, 18);
  ctx.textAlign = "left";

  const wx = Math.round(w * 0.2);
  const wy = Math.round(h * 0.13);
  const ww = Math.round(Math.min(w * 0.6, 900));
  const wh = Math.round(Math.min(h * 0.62, 520));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, wx + 6, wy + 12, ww, wh, 12);
  ctx.fill();
  ctx.fillStyle = "#1e1e1e";
  roundRect(ctx, wx, wy, ww, wh, 10);
  ctx.fill();
  ctx.fillStyle = "#323232";
  roundRect(ctx, wx, wy, ww, 30, 10);
  ctx.fill();
  ctx.fillRect(wx, wy + 18, ww, 12);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(wx + 18 + i * 20, wy + 15, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#bdbdbd";
  ctx.textAlign = "center";
  ctx.fillText("studio - -zsh - 100×30", wx + ww / 2, wy + 20);
  ctx.textAlign = "left";
  ctx.font = "13px Menlo, Consolas, monospace";
  const lines: Array<[string, string]> = [
    ["#9aa0a6", "Last login: Thu Oct  8 09:12:44 on console"],
    ["#4ade80", "studio@design-mac ~ % brew upgrade"],
    ["#e5e5e5", "==> Upgrading 3 outdated packages:"],
    ["#e5e5e5", "node 24.8.0 -> 24.9.0"],
    ["#e5e5e5", "ffmpeg 7.1.1 -> 7.1.2"],
    ["#e5e5e5", "git 2.51.0 -> 2.51.1"],
    ["#4ade80", "studio@design-mac ~ % "],
  ];
  lines.forEach(([color, text], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, wx + 16, wy + 56 + i * 20);
  });

  const dockW = Math.min(w * 0.5, 620);
  const dx = (w - dockW) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(ctx, dx, h - 74, dockW, 64, 18);
  ctx.fill();
  const appColors = [
    "#3b82f6",
    "#f43f5e",
    "#22c55e",
    "#f59e0b",
    "#a855f7",
    "#0ea5e9",
    "#111827",
    "#f39044",
    "#e5e7eb",
  ];
  const size = Math.min(48, (dockW - 20) / appColors.length - 10);
  appColors.forEach((color, i) => {
    ctx.fillStyle = color;
    roundRect(ctx, dx + 14 + i * (size + 10), h - 66, size, size, 12);
    ctx.fill();
  });
}

const CONSOLE_LINES = [
  "",
  "User Access Verification",
  "",
  "Username: admin",
  "Password:",
  "",
  "core-switch#show interfaces status",
  "",
  "Port      Name               Status       Vlan       Duplex  Speed Type",
  "Gi1/0/1   uplink-proxmox     connected    trunk      a-full a-1000 10/100/1000BaseTX",
  "Gi1/0/2   nas                connected    10         a-full a-1000 10/100/1000BaseTX",
  "Gi1/0/3   pihole             connected    10         a-full  a-100 10/100/1000BaseTX",
  "Gi1/0/4   media-server       notconnect   10           auto   auto 10/100/1000BaseTX",
  "Gi1/0/5   workshop-pc        connected    20         a-full a-1000 10/100/1000BaseTX",
  "Gi1/0/6   ap-livingroom      connected    trunk      a-full a-1000 10/100/1000BaseTX",
  "Gi1/0/7                      disabled     1            auto   auto 10/100/1000BaseTX",
  "Te1/0/1   uplink-fiber       connected    trunk        full    10G SFP-10GBase-SR",
  "",
  "core-switch#show vlan brief",
  "",
  "VLAN Name                             Status    Ports",
  "---- -------------------------------- --------- -------------------------------",
  "1    default                          active    Gi1/0/7",
  "10   servers                          active    Gi1/0/2, Gi1/0/3, Gi1/0/4",
  "20   clients                          active    Gi1/0/5",
  "30   iot                              active",
  "",
];

function drawConsole(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  typed: string,
) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "15px Consolas, Menlo, monospace";
  const lineHeight = 19;
  const lines = [...CONSOLE_LINES, `core-switch#${typed}█`];
  const maxLines = Math.floor((h - 16) / lineHeight);
  const visible = lines.slice(-maxLines);
  visible.forEach((line, i) => {
    ctx.fillStyle = line.startsWith("core-switch#") ? "#ffffff" : "#d4d4d4";
    ctx.fillText(line, 10, 22 + i * lineHeight);
  });
}

export function renderScene(
  kind: SceneKind,
  width: number,
  height: number,
  typed = "",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  if (kind === "windows") drawWindows(ctx, width, height);
  else if (kind === "mac") drawMac(ctx, width, height);
  else drawConsole(ctx, width, height, typed);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
