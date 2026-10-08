import { get, HttpError, post, put } from "../../router";
import { value } from "../../store";
import { hosts } from "../hosts";
import {
  TMUX_CREATED,
  TMUX_SESSIONS,
  type TmuxSessionSeed,
} from "../../../fixtures/tmux";

const P = "/plugin-api/tmux-monitor";

/** Every host with Tmux Monitor on shares the same set of sessions. */
const sessions = value<TmuxSessionSeed[]>("tmux-sessions", () =>
  structuredClone(TMUX_SESSIONS),
);

function hostOn(hostId: string) {
  const host = hosts.find(hostId);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  return host.pluginSettings?.["tmux-monitor"]?.enableTmuxMonitor === true;
}

let paneCounter = 100;

get(`${P}/:hostId/overview`, (req) => {
  if (!hostOn(req.params.hostId)) return { available: true, sessions: [] };
  const t = Math.floor(Date.now() / 1000);
  return {
    available: true,
    sessions: sessions.get().map((s, si) => ({
      name: s.name,
      created: TMUX_CREATED + si * 3600,
      lastActivity: t - si * 420,
      attachedClients: s.attached,
      tags: s.tags,
      windows: s.windows.map((w, wi) => ({
        index: wi,
        name: w.name,
        active: wi === 0,
        panes: w.panes.map((p, pi) => ({
          id: p.id,
          index: pi,
          pid: 2200 + Number(p.id.slice(1)),
          active: pi === 0,
          width: w.panes.length > 1 ? 90 : 180,
          height: 48,
          command: p.command,
          path: p.path,
          title: p.title,
        })),
      })),
    })),
  };
});
get(`${P}/:hostId/metrics`, () => ({
  panes: sessions.get().flatMap((s) =>
    s.windows.flatMap((w) =>
      w.panes.map((p) => ({
        paneId: p.id,
        sessionName: s.name,
        pid: 2200 + Number(p.id.slice(1)),
        processCount: p.command === "bash" ? 1 : 2,
        cpuPercent: p.command === "htop" ? 1.8 : p.command === "tail" ? 0.2 : 0,
        memRssKb: p.command === "psql" ? 18_400 : 5_200,
        gpuMemMb: 0,
        topCommand: p.command,
      })),
    ),
  ),
}));
get(`${P}/:hostId/search`, (req) => {
  const q = (req.query.q ?? "").toLowerCase();
  const matches = sessions.get().flatMap((s) =>
    s.windows.flatMap((w, wi) =>
      w.panes.flatMap((p) =>
        p.output
          .map((text, line) => ({
            paneId: p.id,
            sessionName: s.name,
            windowIndex: wi,
            line,
            text,
          }))
          .filter((m) => q && m.text.toLowerCase().includes(q)),
      ),
    ),
  );
  return { matches, truncated: false, searchedLines: 2000, maxPanes: 50 };
});

function update(fn: (all: TmuxSessionSeed[]) => TmuxSessionSeed[]) {
  sessions.update((all) => fn(structuredClone(all)));
}

post(`${P}/:hostId/focus`, () => ({ success: true }));
post(`${P}/:hostId/sessions`, (req) => {
  const { name } = req.body as { name: string };
  paneCounter += 1;
  update((all) => [
    ...all,
    {
      name,
      tags: [],
      attached: 0,
      windows: [
        {
          name: "bash",
          panes: [
            {
              id: `%${paneCounter}`,
              command: "bash",
              path: "/home/deploy",
              title: "bash",
              output: ["deploy@web-01:~$ "],
            },
          ],
        },
      ],
    },
  ]);
  return { success: true };
});
post(`${P}/:hostId/windows`, (req) => {
  const { sessionName } = req.body as { sessionName: string };
  paneCounter += 1;
  update((all) =>
    all.map((s) =>
      s.name === sessionName
        ? {
            ...s,
            windows: [
              ...s.windows,
              {
                name: "bash",
                panes: [
                  {
                    id: `%${paneCounter}`,
                    command: "bash",
                    path: "/home/deploy",
                    title: "bash",
                    output: ["deploy@web-01:~$ "],
                  },
                ],
              },
            ],
          }
        : s,
    ),
  );
  return { success: true };
});
post(`${P}/:hostId/rename`, (req) => {
  const { sessionName, newName } = req.body as {
    sessionName: string;
    newName: string;
  };
  update((all) =>
    all.map((s) => (s.name === sessionName ? { ...s, name: newName } : s)),
  );
  return { success: true };
});
post(`${P}/:hostId/kill`, (req) => {
  const { sessionName } = req.body as { sessionName: string };
  update((all) => all.filter((s) => s.name !== sessionName));
  return { success: true };
});
post(`${P}/:hostId/kill-window`, (req) => {
  const { sessionName, windowIndex } = req.body as {
    sessionName: string;
    windowIndex: number;
  };
  update((all) =>
    all.map((s) =>
      s.name === sessionName
        ? { ...s, windows: s.windows.filter((_, i) => i !== windowIndex) }
        : s,
    ),
  );
  return { success: true };
});
post(`${P}/:hostId/kill-pane`, (req) => {
  const { paneId } = req.body as { paneId: string };
  update((all) =>
    all.map((s) => ({
      ...s,
      windows: s.windows.map((w) => ({
        ...w,
        panes: w.panes.filter((p) => p.id !== paneId),
      })),
    })),
  );
  return { success: true };
});
post(`${P}/:hostId/split`, (req) => {
  const { paneId } = req.body as { paneId: string };
  paneCounter += 1;
  update((all) =>
    all.map((s) => ({
      ...s,
      windows: s.windows.map((w) =>
        w.panes.some((p) => p.id === paneId)
          ? {
              ...w,
              panes: [
                ...w.panes,
                {
                  id: `%${paneCounter}`,
                  command: "bash",
                  path: "/home/deploy",
                  title: "bash",
                  output: ["deploy@web-01:~$ "],
                },
              ],
            }
          : w,
      ),
    })),
  );
  return { success: true };
});
put(`${P}/:hostId/tags`, (req) => {
  const { sessionName, tags } = req.body as {
    sessionName: string;
    tags: string[];
  };
  update((all) =>
    all.map((s) => (s.name === sessionName ? { ...s, tags } : s)),
  );
  return { tags };
});

/** What a terminal attached to this session shows first. */
export function tmuxScreen(sessionName: string, cols = 120): string | null {
  const session = sessions.get().find((s) => s.name === sessionName);
  if (!session) return null;
  const pane = session.windows[0]?.panes[0];
  const body = (pane?.output ?? []).join("\r\n");
  const left = `[${session.name}] ${session.windows.map((w, i) => `${i}:${w.name}${i === 0 ? "*" : ""}`).join(" ")}`;
  const right = `"${pane?.title ?? ""}" ${new Date().toTimeString().slice(0, 5)}`;
  const gap = Math.max(1, cols - left.length - right.length);
  return `\x1b[2J\x1b[H${body}\x1b[999;1H\x1b[30;42m${left}${" ".repeat(gap)}${right}\x1b[0m\x1b[H\x1b[${pane?.output.length ?? 1};${(pane?.output.at(-1)?.length ?? 0) + 1}H`;
}
