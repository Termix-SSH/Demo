import { del, get, HttpError, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/samba";

interface Share {
  name: string;
  path: string;
  comment: string;
  browseable: boolean;
  readOnly: boolean;
  guestOk: boolean;
  validUsers: string[];
  writeList: string[];
  forceUser: string;
  forceGroup: string;
  createMask: string;
  directoryMask: string;
  hideDotFiles: boolean;
  recycleBin: boolean;
  inheritPermissions: boolean;
  managed: boolean;
}

interface Acl {
  type: "user" | "group";
  name: string;
  perms: string;
}

interface Folder {
  owner: string;
  group: string;
  mode: string;
  acl: Acl[];
}

interface State {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  shares: Share[];
  folders: Record<string, Folder>;
  users: Array<{ name: string; fullName: string; disabled: boolean }>;
  system: string[];
  groups: Array<{ name: string; gid: number; members: string[] }>;
  sessions: Array<{
    pid: number;
    user: string;
    group: string;
    machine: string;
    protocol: string;
  }>;
}

const share = (s: Partial<Share> & Pick<Share, "name" | "path">): Share => ({
  comment: "",
  browseable: true,
  readOnly: false,
  guestOk: false,
  validUsers: [],
  writeList: [],
  forceUser: "",
  forceGroup: "",
  createMask: "0664",
  directoryMask: "0775",
  hideDotFiles: true,
  recycleBin: false,
  inheritPermissions: false,
  managed: true,
  ...s,
});

const state = value<State>("samba-state", () => ({
  installed: true,
  active: true,
  enabled: true,
  shares: [
    share({
      name: "homes",
      path: "%H",
      comment: "Home Directories",
      browseable: false,
      managed: false,
    }),
    share({
      name: "media",
      path: "/srv/media",
      comment: "Movies, shows and music",
      readOnly: true,
      guestOk: true,
      writeList: ["@media"],
      forceGroup: "media",
    }),
    share({
      name: "backups",
      path: "/srv/backups",
      comment: "Nightly backups",
      browseable: false,
      validUsers: ["admin", "backup"],
      recycleBin: true,
    }),
    share({
      name: "family",
      path: "/srv/family",
      comment: "Photos and documents",
      validUsers: ["@family"],
      forceGroup: "family",
      inheritPermissions: true,
      recycleBin: true,
    }),
  ],
  folders: {
    "/srv/media": {
      owner: "media",
      group: "media",
      mode: "2775",
      acl: [{ type: "group", name: "family", perms: "r-x" }],
    },
    "/srv/backups": {
      owner: "backup",
      group: "backup",
      mode: "0770",
      acl: [{ type: "user", name: "admin", perms: "rwx" }],
    },
    "/srv/family": {
      owner: "root",
      group: "family",
      mode: "2770",
      acl: [
        { type: "group", name: "family", perms: "rwx" },
        { type: "user", name: "media", perms: "r-x" },
      ],
    },
  },
  users: [
    { name: "admin", fullName: "NAS admin", disabled: false },
    { name: "backup", fullName: "Backup jobs", disabled: false },
    { name: "maria", fullName: "Maria", disabled: false },
    { name: "tom", fullName: "Tom", disabled: false },
    { name: "guestpc", fullName: "", disabled: true },
  ],
  system: ["admin", "backup", "maria", "tom", "guestpc", "media", "jellyfin"],
  groups: [
    { name: "family", gid: 1010, members: ["maria", "tom"] },
    { name: "media", gid: 1011, members: ["jellyfin", "maria"] },
    { name: "backup", gid: 1012, members: ["backup"] },
  ],
  sessions: [
    {
      pid: 41822,
      user: "maria",
      group: "family",
      machine: "192.168.1.64 (ipv4:192.168.1.64:51544)",
      protocol: "SMB3_11",
    },
    {
      pid: 41907,
      user: "tom",
      group: "family",
      machine: "192.168.1.71 (ipv4:192.168.1.71:49822)",
      protocol: "SMB3_11",
    },
    {
      pid: 42011,
      user: "backup",
      group: "backup",
      machine: "10.0.12.40 (ipv4:10.0.12.40:60112)",
      protocol: "SMB3_02",
    },
  ],
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findShare(name: string): Share {
  const found = state.get().shares.find((s) => s.name === name);
  if (!found) throw new HttpError(404, { error: "Share not found" });
  if (!found.managed) {
    throw new HttpError(400, {
      error: "This share is in smb.conf and can only be changed there",
    });
  }
  return found;
}

function shareBlock(s: Share): string {
  const yes = (b: boolean) => (b ? "yes" : "no");
  const lines = [
    `[${s.name}]`,
    `   path = ${s.path}`,
    s.comment && `   comment = ${s.comment}`,
    `   browseable = ${yes(s.browseable)}`,
    `   read only = ${yes(s.readOnly)}`,
    `   guest ok = ${yes(s.guestOk)}`,
    s.validUsers.length && `   valid users = ${s.validUsers.join(" ")}`,
    s.writeList.length && `   write list = ${s.writeList.join(" ")}`,
    s.forceUser && `   force user = ${s.forceUser}`,
    s.forceGroup && `   force group = ${s.forceGroup}`,
    `   create mask = ${s.createMask}`,
    `   directory mask = ${s.directoryMask}`,
    s.inheritPermissions && "   inherit permissions = yes",
    s.recycleBin && "   vfs objects = recycle",
  ];
  return lines.filter(Boolean).join("\n");
}

function managedConfig(): string {
  return [
    "# Managed by Termix. Changes made here are kept.",
    "",
    ...state
      .get()
      .shares.filter((s) => s.managed)
      .map((s) => `${shareBlock(s)}\n`),
  ].join("\n");
}

const MAIN = `[global]
   workgroup = WORKGROUP
   server string = %h server (Samba, Ubuntu)
   server role = standalone server
   log file = /var/log/samba/log.%m
   max log size = 1000
   logging = file
   map to guest = bad user
   usershare allow guests = yes
   server min protocol = SMB2_10

[homes]
   comment = Home Directories
   browseable = no
   read only = yes
   create mask = 0700
   directory mask = 0700
   valid users = %S

include = /etc/samba/termix.conf
`;

function input(body: unknown): Share {
  const b = (body ?? {}) as Partial<Share>;
  if (!b.name || !/^[\w.-]+$/.test(b.name)) {
    throw new HttpError(400, {
      error: "Use letters, numbers, dots and dashes",
    });
  }
  if (!b.path?.startsWith("/")) {
    throw new HttpError(400, { error: "The path must be absolute" });
  }
  return { ...share({ name: b.name, path: b.path }), ...b, managed: true };
}

get(`${P}/:host/status`, () => {
  const s = state.get();
  return {
    root: true,
    os: "Ubuntu 24.04.1 LTS",
    packageManager: "apt",
    installed: s.installed,
    version: s.installed ? "4.19.5-Ubuntu" : "",
    init: "systemd",
    service: "smbd",
    active: s.active,
    enabled: s.enabled,
    firewall: "ufw active, Samba allowed",
    selinux: "",
    included: true,
    acl: true,
  };
});
post(`${P}/:host/install`, async () => {
  await wait(2500);
  state.update((s) => ({ ...s, installed: true, active: true, enabled: true }));
  return { ok: true };
});
post(`${P}/:host/service/:action`, async (req) => {
  await wait(700);
  const action = req.params.action;
  state.update((s) => ({
    ...s,
    active: action === "stop" ? false : action === "reload" ? s.active : true,
    enabled:
      action === "enable" ? true : action === "disable" ? false : s.enabled,
  }));
  return { ok: true };
});

get(`${P}/:host/shares`, () => state.get().shares);
post(`${P}/:host/shares`, async (req) => {
  const next = input(req.body);
  const b = (req.body ?? {}) as {
    makeFolder?: boolean;
    owner?: string;
    group?: string;
    mode?: string;
  };
  if (state.get().shares.some((s) => s.name === next.name)) {
    throw new HttpError(409, { error: "A share with this name exists" });
  }
  await wait(600);
  state.update((s) => ({
    ...s,
    shares: [...s.shares, { ...next, managed: true }],
    folders: b.makeFolder
      ? {
          ...s.folders,
          [next.path]: {
            owner: b.owner || "root",
            group: b.group || "root",
            mode: b.mode || "2775",
            acl: [],
          },
        }
      : s.folders,
  }));
  return { ok: true };
});
put(`${P}/:host/shares/:name`, async (req) => {
  findShare(req.params.name);
  const next = input(req.body);
  await wait(500);
  state.update((s) => ({
    ...s,
    shares: s.shares.map((x) => (x.name === req.params.name ? next : x)),
  }));
  return { ok: true };
});
del(`${P}/:host/shares/:name`, (req) => {
  findShare(req.params.name);
  state.update((s) => ({
    ...s,
    shares: s.shares.filter((x) => x.name !== req.params.name),
  }));
  return { ok: true };
});
get(`${P}/:host/shares/:name/permissions`, (req) => {
  const s = state.get().shares.find((x) => x.name === req.params.name);
  if (!s) throw new HttpError(404, { error: "Share not found" });
  const folder = state.get().folders[s.path];
  return {
    path: s.path,
    exists: !!folder,
    owner: folder?.owner ?? "",
    group: folder?.group ?? "",
    mode: folder?.mode ?? "",
    acl: folder?.acl ?? [],
  };
});
put(`${P}/:host/shares/:name/permissions`, async (req) => {
  const s = findShare(req.params.name);
  const b = req.body as {
    owner: string;
    group: string;
    mode: string;
    setAcl: Acl[];
    removeAcl: Acl[];
  };
  await wait(500);
  state.update((st) => {
    const current = st.folders[s.path]?.acl ?? [];
    const same = (a: Acl, c: Acl) => a.type === c.type && a.name === c.name;
    const acl = [
      ...current.filter(
        (a) =>
          !b.removeAcl.some((r) => same(a, r)) &&
          !b.setAcl.some((r) => same(a, r)),
      ),
      ...b.setAcl,
    ];
    return {
      ...st,
      folders: {
        ...st.folders,
        [s.path]: { owner: b.owner, group: b.group, mode: b.mode, acl },
      },
    };
  });
  return { ok: true };
});

get(`${P}/:host/users`, () => {
  const s = state.get();
  return { samba: s.users, system: s.system, groups: s.groups };
});
post(`${P}/:host/users`, async (req) => {
  const b = req.body as { name: string; createSystem: boolean };
  if (state.get().users.some((u) => u.name === b.name)) {
    throw new HttpError(409, { error: "This user already exists" });
  }
  await wait(500);
  state.update((s) => ({
    ...s,
    users: [...s.users, { name: b.name, fullName: "", disabled: false }],
    system: s.system.includes(b.name) ? s.system : [...s.system, b.name],
  }));
  return { ok: true };
});
post(`${P}/:host/users/:name/password`, async () => {
  await wait(400);
  return { ok: true };
});
post(`${P}/:host/users/:name/state`, (req) => {
  const { disabled } = req.body as { disabled: boolean };
  state.update((s) => ({
    ...s,
    users: s.users.map((u) =>
      u.name === req.params.name ? { ...u, disabled } : u,
    ),
  }));
  return { ok: true };
});
del(`${P}/:host/users/:name`, (req) => {
  state.update((s) => ({
    ...s,
    users: s.users.filter((u) => u.name !== req.params.name),
    system:
      req.query.removeSystem === "true"
        ? s.system.filter((u) => u !== req.params.name)
        : s.system,
  }));
  return { ok: true };
});
post(`${P}/:host/groups`, (req) => {
  const { name } = req.body as { name: string };
  state.update((s) => ({
    ...s,
    groups: [
      ...s.groups,
      {
        name,
        gid: Math.max(...s.groups.map((g) => g.gid)) + 1,
        members: [],
      },
    ],
  }));
  return { ok: true };
});
post(`${P}/:host/groups/:group/members`, (req) => {
  const { user, add } = req.body as { user: string; add: boolean };
  state.update((s) => ({
    ...s,
    groups: s.groups.map((g) =>
      g.name !== req.params.group
        ? g
        : {
            ...g,
            members: add
              ? [...new Set([...g.members, user])]
              : g.members.filter((m) => m !== user),
          },
    ),
  }));
  return { ok: true };
});

get(`${P}/:host/sessions`, () => {
  const sessions = state.get().sessions;
  const since = (min: number) =>
    new Date(Date.now() - min * 60_000).toUTCString();
  const shareFor: Record<string, string> = {
    maria: "family",
    tom: "media",
    backup: "backups",
  };
  return {
    json: true,
    sessions,
    connections: sessions.map((s, i) => ({
      pid: s.pid,
      share: shareFor[s.user] ?? "media",
      machine: s.machine.split(" ")[0],
      since: since(14 + i * 31),
    })),
    files: [
      {
        pid: 41822,
        share: "family",
        user: "maria",
        file: "Photos/2026/summer/IMG_2041.jpg",
      },
      {
        pid: 41907,
        share: "media",
        user: "tom",
        file: "Shows/Northern Lights/S01E03.mkv",
      },
      {
        pid: 42011,
        share: "backups",
        user: "backup",
        file: "db-primary/2026-10-21.sql.zst",
      },
    ].filter((f) => sessions.some((s) => s.pid === f.pid)),
    raw: "",
  };
});
post(`${P}/:host/sessions/:pid/disconnect`, (req) => {
  state.update((s) => ({
    ...s,
    sessions: s.sessions.filter((x) => String(x.pid) !== req.params.pid),
  }));
  return { ok: true };
});

const customConfig = value<string | null>("samba-config", () => null);
get(`${P}/:host/config`, () => ({
  managed: customConfig.get() ?? managedConfig(),
  main: MAIN,
}));
put(`${P}/:host/config`, (req) => {
  customConfig.set((req.body as { text: string }).text);
  return { ok: true };
});
post(`${P}/:host/config/test`, async () => {
  await wait(500);
  return {
    ok: true,
    output: [
      "Load smb config files from /etc/samba/smb.conf",
      "Loaded services file OK.",
      "Weak crypto is allowed by GnuTLS (e.g. NTLM as a compatibility fallback)",
      "",
      "Server role: ROLE_STANDALONE",
    ].join("\n"),
  };
});

get(`${P}/:host/logs`, () => {
  const t = (min: number) =>
    new Date(Date.now() - min * 60_000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
  return {
    text: [
      `[${t(95)}.112094,  0] ../../source3/smbd/server.c:1746(main)`,
      "  smbd version 4.19.5-Ubuntu started.",
      "  Copyright Andrew Tridgell and the Samba Team 1992-2023",
      `[${t(95)}.240511,  2] ../../source3/smbd/server.c:1239(smbd_parent_loop)`,
      "  waiting for connections",
      `[${t(44)}.611820,  1] ../../source3/smbd/smb2_service.c:885(make_connection_snum)`,
      "  192.168.1.64 (ipv4:192.168.1.64:51544) connect to service family initially as user maria (uid=1001, gid=1010)",
      `[${t(31)}.002417,  1] ../../source3/smbd/smb2_service.c:885(make_connection_snum)`,
      "  192.168.1.71 (ipv4:192.168.1.71:49822) connect to service media initially as user tom (uid=1002, gid=1010)",
      `[${t(12)}.880341,  1] ../../source3/auth/auth.c:342(auth_check_ntlm_password)`,
      "  check_ntlm_password:  Authentication for user [guestpc] -> [guestpc] FAILED with error NT_STATUS_ACCOUNT_DISABLED",
      `[${t(3)}.418265,  1] ../../source3/smbd/smb2_service.c:885(make_connection_snum)`,
      "  10.0.12.40 (ipv4:10.0.12.40:60112) connect to service backups initially as user backup (uid=1003, gid=1012)",
    ].join("\n"),
  };
});
