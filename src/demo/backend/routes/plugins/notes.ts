import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/notes";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

interface Note {
  id: number;
  uid: string;
  scope: "host" | "folder" | "global";
  hostId: number | null;
  folder: string | null;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
}

const notes = collection<Note>("notes-notes", () => [
  {
    id: 1,
    uid: "n-restart",
    scope: "host",
    hostId: 1,
    folder: null,
    title: "Restart order",
    body: "## Restart order\n\n1. Drain web-01 from the load balancer\n2. Restart nginx\n3. Check `/health`\n\n```sh\nsudo systemctl restart nginx\ncurl -s localhost/health\n```\n",
    tags: ["runbook"],
    pinned: true,
    updatedAt: ago(180),
  },
  {
    id: 2,
    uid: "n-db",
    scope: "host",
    hostId: 3,
    folder: null,
    title: "Backup and restore",
    body: "Nightly dump runs at 02:00. Restore with:\n\n```sh\npg_restore -d app /backups/latest.dump\n```\n",
    tags: ["postgres"],
    pinned: false,
    updatedAt: ago(60 * 30),
  },
  {
    id: 3,
    uid: "n-prod",
    scope: "folder",
    hostId: null,
    folder: "Production",
    title: "On call contacts",
    body: "- Dana: ext 204\n- Sam: ext 311\n\nEscalate after 15 minutes.\n",
    tags: ["oncall"],
    pinned: true,
    updatedAt: ago(60 * 70),
  },
  {
    id: 4,
    uid: "n-todo",
    scope: "global",
    hostId: null,
    folder: null,
    title: "Homelab todo",
    body: "- [x] Replace the NAS fan\n- [ ] Move DNS to the Pi\n- [ ] Label the patch panel\n",
    tags: [],
    pinned: false,
    updatedAt: ago(60 * 5),
  },
]);

const view = (n: Note) => {
  const { id: _id, body, ...rest } = n;
  return {
    ...rest,
    excerpt: body
      .replace(/[#`>*-]/g, "")
      .trim()
      .slice(0, 120),
    mine: true,
    canEdit: true,
  };
};
const full = (n: Note) => ({ ...view(n), body: n.body });

get(`${P}/notes`, (req) => {
  const { scope, hostId, folder, q } = req.query;
  const needle = (q ?? "").toLowerCase();
  return notes
    .all()
    .filter(
      (n) =>
        (!scope || n.scope === scope) &&
        (!hostId || n.hostId === Number(hostId)) &&
        (!folder || n.folder === folder) &&
        (!needle ||
          n.title.toLowerCase().includes(needle) ||
          n.body.toLowerCase().includes(needle)),
    )
    .map(view);
});
get(`${P}/search`, (req) => {
  const needle = (req.query.q ?? "").toLowerCase();
  return notes
    .all()
    .filter(
      (n) =>
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle),
    )
    .map(view);
});
get(`${P}/notes/:uid`, (req) => {
  const n = notes.all().find((x) => x.uid === req.params.uid);
  return n ? full(n) : { error: "Note not found" };
});
post(`${P}/notes`, (req) => {
  const b = req.body as Partial<Note>;
  const id = notes.nextId();
  return full(
    notes.insert({
      scope: "global",
      hostId: null,
      folder: null,
      title: "Untitled",
      body: "",
      tags: [],
      pinned: false,
      ...b,
      id,
      uid: `n-${id}-${Date.now().toString(36)}`,
      updatedAt: ago(0),
    }),
  );
});
put(`${P}/notes/:uid`, (req) => {
  const n = notes.all().find((x) => x.uid === req.params.uid);
  if (!n) return { error: "Note not found" };
  const next = notes.patch(n.id, {
    ...(req.body as Partial<Note>),
    updatedAt: ago(0),
  });
  return next ? full(next) : { error: "Note not found" };
});
del(`${P}/notes/:uid`, (req) => {
  const n = notes.all().find((x) => x.uid === req.params.uid);
  if (n) notes.remove(n.id);
  return { ok: true };
});
