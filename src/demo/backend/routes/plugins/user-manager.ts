import { del, get, HttpError, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/user-manager";

interface User {
  name: string;
  uid: number;
  gid: number;
  group: string;
  comment: string;
  home: string;
  shell: string;
  groups: string[];
  sudo: boolean;
  system: boolean;
  self: boolean;
  password: "set" | "locked" | "none" | "empty" | "unknown";
  expired: boolean;
  passwordChanged: string;
  canLogin: boolean;
}

const user = (name: string, uid: number, extra: Partial<User> = {}): User => ({
  name,
  uid,
  gid: uid,
  group: name,
  comment: "",
  home: uid === 0 ? "/root" : `/home/${name}`,
  shell: "/bin/bash",
  groups: [],
  sudo: false,
  system: uid > 0 && uid < 1000,
  self: false,
  password: "set",
  expired: false,
  passwordChanged: "2026-09-14",
  canLogin: true,
  ...extra,
});

const state = value("user-manager-state", () => ({
  users: [
    user("root", 0, { sudo: true, password: "none" }),
    user("www-data", 33, {
      home: "/var/www",
      shell: "/usr/sbin/nologin",
      canLogin: false,
      password: "none",
    }),
    user("postgres", 113, {
      comment: "PostgreSQL administrator",
      home: "/var/lib/postgresql",
      password: "none",
    }),
    user("deploy", 1000, {
      comment: "Deploy",
      groups: ["sudo", "docker"],
      sudo: true,
      self: true,
    }),
    user("alice", 1001, { comment: "Alice Smith", groups: ["docker", "devs"] }),
    user("bob", 1002, {
      comment: "Bob Jones",
      groups: ["devs"],
      password: "locked",
      expired: true,
    }),
  ],
  extra: [
    { name: "sudo", gid: 27 },
    { name: "docker", gid: 999 },
    { name: "devs", gid: 1010 },
  ],
}));

const list = () => {
  const s = state.get();
  const groups = [
    ...s.users.map((u) => ({ name: u.group, gid: u.gid })),
    ...s.extra,
  ].map((g) => ({
    ...g,
    members: s.users
      .filter((u) => u.groups.includes(g.name))
      .map((u) => u.name),
    primaryOf: s.users.filter((u) => u.group === g.name).map((u) => u.name),
    system: g.gid < 1000,
  }));
  return { users: s.users, groups };
};

const change = (name: string, fn: (u: User) => User) => {
  const s = state.get();
  if (!s.users.some((u) => u.name === name))
    throw new HttpError(404, { error: "No such user" });
  state.update((st) => ({
    ...st,
    users: st.users.map((u) => (u.name === name ? fn(u) : u)),
  }));
  return { ok: true };
};

const guard = (name: string) => {
  if (name === "root" || name === "deploy") {
    throw new HttpError(400, {
      error: "You can't do this to root or the user Termix logs in as",
    });
  }
};

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  user: "deploy",
  root: true,
  sudoGroup: "sudo",
  shells: ["/bin/bash", "/bin/sh", "/bin/zsh", "/usr/bin/fish"],
  uidMin: 1000,
  tools: true,
  canEdit: true,
  readOnly: false,
}));
get(`${P}/:host/users`, list);
get(`${P}/:host/users/:name`, (req) => ({
  lastLogin:
    req.params.name === "deploy"
      ? "pts/0 100.64.0.7 Wed Nov 4 18:22:10 +0000 2026"
      : "",
  loginKnown: true,
  keys:
    req.params.name === "deploy" || req.params.name === "alice"
      ? [
          {
            line: 0,
            type: "ssh-ed25519",
            fingerprint: "SHA256:OKxgSXXwa1DC/FJsVQ6Noq43N4V026aOZl0aITmP0Yk",
            comment: `${req.params.name}@laptop`,
            options: false,
          },
        ]
      : [],
  keysError: "",
}));
post(`${P}/:host/users`, (req) => {
  const b = req.body as {
    name: string;
    comment?: string;
    shell?: string;
    groups?: string[];
    sudo?: boolean;
  };
  const s = state.get();
  const uid = Math.max(...s.users.map((u) => u.uid)) + 1;
  const groups = [...(b.groups ?? []), ...(b.sudo ? ["sudo"] : [])];
  state.update((st) => ({
    ...st,
    users: [
      ...st.users,
      user(b.name, uid, {
        comment: b.comment ?? "",
        shell: b.shell || "/bin/bash",
        groups,
        sudo: !!b.sudo,
      }),
    ],
  }));
  return { ok: true };
});
put(`${P}/:host/users/:name`, (req) => {
  const b = req.body as { comment?: string; shell?: string; groups?: string[] };
  return change(req.params.name, (u) => ({
    ...u,
    comment: b.comment ?? u.comment,
    shell: b.shell ?? u.shell,
    groups: b.groups ?? u.groups,
    sudo: (b.groups ?? u.groups).includes("sudo"),
  }));
});
post(`${P}/:host/users/:name/password`, (req) =>
  change(req.params.name, (u) => ({ ...u, password: "set" })),
);
post(`${P}/:host/users/:name/expire-password`, () => ({ ok: true }));
post(`${P}/:host/users/:name/lock`, (req) => {
  const locked = (req.body as { locked?: boolean }).locked === true;
  if (locked) guard(req.params.name);
  return change(req.params.name, (u) => ({
    ...u,
    password: locked ? "locked" : "set",
    expired: locked,
  }));
});
post(`${P}/:host/users/:name/sudo`, (req) => {
  const on = (req.body as { sudo?: boolean }).sudo === true;
  if (!on) guard(req.params.name);
  return change(req.params.name, (u) => ({
    ...u,
    sudo: on,
    groups: on
      ? [...new Set([...u.groups, "sudo"])]
      : u.groups.filter((g) => g !== "sudo"),
  }));
});
del(`${P}/:host/users/:name`, (req) => {
  guard(req.params.name);
  state.update((st) => ({
    ...st,
    users: st.users.filter((u) => u.name !== req.params.name),
  }));
  return { ok: true };
});
post(`${P}/:host/users/:name/keys`, () => {
  throw new HttpError(400, {
    error: "Adding keys is not available in the demo.",
  });
});
del(`${P}/:host/users/:name/keys/:line`, () => {
  throw new HttpError(400, {
    error: "Removing keys is not available in the demo.",
  });
});
get(`${P}/:host/sessions`, () => ({
  sessions: [
    {
      user: "deploy",
      tty: "pts/0",
      since: "2026-11-04 18:22",
      from: "100.64.0.7",
    },
    {
      user: "alice",
      tty: "pts/1",
      since: "2026-11-04 19:05",
      from: "10.0.0.24",
    },
  ],
  recent: [
    "deploy   pts/0        100.64.0.7       Wed Nov  4 18:22   still logged in",
    "alice    pts/1        10.0.0.24        Wed Nov  4 19:05   still logged in",
    "deploy   pts/0        100.64.0.7       Tue Nov  3 09:12 - 17:40  (08:28)",
  ],
}));
post(`${P}/:host/groups`, (req) => {
  const name = (req.body as { name: string }).name;
  state.update((st) => ({
    ...st,
    extra: [...st.extra, { name, gid: 1011 + st.extra.length }],
  }));
  return { ok: true };
});
del(`${P}/:host/groups/:name`, (req) => {
  state.update((st) => ({
    ...st,
    extra: st.extra.filter((g) => g.name !== req.params.name),
  }));
  return { ok: true };
});
post(`${P}/:host/groups/:name/members`, (req) => {
  const b = req.body as { user: string; member?: boolean };
  const group = req.params.name;
  return change(b.user, (u) => ({
    ...u,
    groups:
      b.member === false
        ? u.groups.filter((g) => g !== group)
        : [...new Set([...u.groups, group])],
  }));
});
