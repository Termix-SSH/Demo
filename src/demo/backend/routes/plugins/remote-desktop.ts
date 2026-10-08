import { get, post } from "../../router";
import { socket } from "../../sockets";
import { hosts } from "../hosts";
import { renderScene, type SceneKind } from "../../remote-scenes";

const P = "/plugin-api/remote-desktop";

get(`${P}/status`, () => ({
  enabled: true,
  guacd: { status: "connected", host: "guacd", port: 4822 },
}));

function token(hostId: string | number, protocol: string): string {
  return btoa(JSON.stringify({ hostId: Number(hostId), protocol }));
}

post(`${P}/connect-host/:hostId`, (req) => {
  const host = hosts.find(req.params.hostId);
  const requested = (req.body as { protocol?: string })?.protocol;
  const protocol =
    requested ??
    (host?.connectionType && host.connectionType !== "ssh"
      ? host.connectionType
      : "rdp");
  const connectId = `demo-${req.params.hostId}-${Date.now()}`;
  return {
    token: token(req.params.hostId, protocol),
    termixConnectId: connectId,
    guacamoleConnectionId: connectId,
  };
});
post(`${P}/token`, (req) => {
  const body = req.body as { type?: string };
  return { token: token(0, body.type ?? "rdp") };
});
get(`${P}/connection/:id`, (req) => ({ guacamoleConnectionId: req.params.id }));

function element(value: string | number): string {
  const text = String(value);
  return `${text.length}.${text}`;
}
function instruction(opcode: string, ...args: Array<string | number>): string {
  return [opcode, ...args].map(element).join(",") + ";";
}

function parseInstructions(data: string): string[][] {
  const out: string[][] = [];
  let i = 0;
  let current: string[] = [];
  while (i < data.length) {
    const dot = data.indexOf(".", i);
    if (dot === -1) break;
    const length = Number(data.slice(i, dot));
    const value = data.slice(dot + 1, dot + 1 + length);
    current.push(value);
    const terminator = data[dot + 1 + length];
    i = dot + 2 + length;
    if (terminator === ";") {
      out.push(current);
      current = [];
    }
  }
  return out;
}

socket("/plugin-ws/remote-desktop/display", (ws) => {
  let width = Number(ws.query.width) || 1280;
  let height = Number(ws.query.height) || 720;
  let kind: SceneKind = "windows";
  try {
    const parsed = JSON.parse(atob(ws.query.token ?? "")) as {
      protocol?: string;
    };
    kind =
      parsed.protocol === "vnc"
        ? "mac"
        : parsed.protocol === "telnet"
          ? "console"
          : "windows";
  } catch {
    // Unknown token, show the Windows desktop.
  }
  let typed = "";

  const frame = () => {
    ws.send(instruction("size", 0, width, height));
    ws.send(
      instruction("png", 14, 0, 0, 0, renderScene(kind, width, height, typed)),
    );
    ws.send(instruction("sync", Date.now()));
  };

  const id = `$demo-${Math.random().toString(36).slice(2, 10)}`;
  ws.send(instruction("", id));
  setTimeout(() => {
    if (ws.closed) return;
    ws.send(instruction("ready", id));
    frame();
  }, 600);

  const keepalive = setInterval(() => {
    if (ws.closed) {
      clearInterval(keepalive);
      return;
    }
    ws.send(instruction("nop"));
  }, 4000);
  const minute = setInterval(() => {
    if (!ws.closed && kind !== "console") frame();
  }, 60_000);
  ws.onClose(() => {
    clearInterval(keepalive);
    clearInterval(minute);
  });

  ws.onMessage((raw) => {
    if (typeof raw !== "string") return;
    for (const [opcode, ...args] of parseInstructions(raw)) {
      if (opcode === "size" && args.length >= 2) {
        const nextW = Number(args[0]);
        const nextH = Number(args[1]);
        if (
          nextW > 100 &&
          nextH > 100 &&
          (nextW !== width || nextH !== height)
        ) {
          width = nextW;
          height = nextH;
          frame();
        }
      } else if (opcode === "key" && kind === "console" && args[1] === "1") {
        const keysym = Number(args[0]);
        if (keysym === 0xff0d) typed = "";
        else if (keysym === 0xff08) typed = typed.slice(0, -1);
        else if (keysym >= 0x20 && keysym <= 0x7e)
          typed += String.fromCharCode(keysym);
        else continue;
        frame();
      } else if (opcode === "disconnect") {
        ws.close();
      }
    }
  });
});
