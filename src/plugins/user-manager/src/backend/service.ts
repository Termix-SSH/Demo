import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  CreateUserBody,
  SessionsView,
  UpdateUserBody,
  UserDetail,
  UsersList,
  UsersStatus,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import {
  checkNewKey,
  parseDetail,
  parseList,
  parseSessions,
  parseStatus,
} from "./parse.js";
import type { Remote } from "./remote.js";
import {
  LIST_SCRIPT,
  SESSIONS_SCRIPT,
  STATUS_SCRIPT,
  cleanComment,
  cleanName,
  cleanNames,
  cleanPassword,
  cleanPath,
  createGroupScript,
  createScript,
  deleteGroupScript,
  deleteScript,
  detailScript,
  expirePasswordScript,
  groupMemberScript,
  lockScript,
  passwordScript,
  updateScript,
  writeKeysScript,
} from "./scripts.js";

type Status = Omit<UsersStatus, "canEdit" | "readOnly">;

export interface UserService {
  status: (hostId: number, s: HostSettings) => Promise<Status>;
  list: (hostId: number, s: HostSettings) => Promise<UsersList>;
  detail: (
    hostId: number,
    s: HostSettings,
    name: string,
  ) => Promise<UserDetail>;
  sessions: (hostId: number, s: HostSettings) => Promise<SessionsView>;
  create: (
    hostId: number,
    s: HostSettings,
    body: CreateUserBody,
  ) => Promise<void>;
  update: (
    hostId: number,
    s: HostSettings,
    name: string,
    body: UpdateUserBody,
  ) => Promise<void>;
  setPassword: (
    hostId: number,
    s: HostSettings,
    name: string,
    password: unknown,
  ) => Promise<void>;
  lock: (
    hostId: number,
    s: HostSettings,
    name: string,
    lock: boolean,
  ) => Promise<void>;
  expirePassword: (
    hostId: number,
    s: HostSettings,
    name: string,
  ) => Promise<void>;
  remove: (
    hostId: number,
    s: HostSettings,
    name: string,
    removeHome: boolean,
  ) => Promise<void>;
  setSudo: (
    hostId: number,
    s: HostSettings,
    name: string,
    on: boolean,
  ) => Promise<void>;
  addKey: (
    hostId: number,
    s: HostSettings,
    name: string,
    key: unknown,
  ) => Promise<UserDetail>;
  removeKey: (
    hostId: number,
    s: HostSettings,
    name: string,
    line: number,
    fingerprint: string,
  ) => Promise<UserDetail>;
  createGroup: (hostId: number, s: HostSettings, name: string) => Promise<void>;
  deleteGroup: (hostId: number, s: HostSettings, name: string) => Promise<void>;
  setMember: (
    hostId: number,
    s: HostSettings,
    group: string,
    user: string,
    add: boolean,
  ) => Promise<void>;
}

export function createService(remote: Remote): UserService {
  const status = async (hostId: number, s: HostSettings) =>
    parseStatus((await remote.read(hostId, s.sudo, STATUS_SCRIPT)).stdout);

  const list = async (hostId: number, s: HostSettings) => {
    const [st, out] = await Promise.all([
      status(hostId, s),
      remote.read(hostId, s.sudo, LIST_SCRIPT, { maxOutputBytes: 2_000_000 }),
    ]);
    return parseList(out.stdout, st.uidMin);
  };

  const root = (hostId: number, s: HostSettings, script: string) =>
    remote.root(hostId, s.sudo, script);

  const readDetail = async (hostId: number, s: HostSettings, name: string) =>
    parseDetail((await remote.read(hostId, s.sudo, detailScript(name))).stdout);

  const shellOf = async (hostId: number, s: HostSettings, value: unknown) => {
    if (value === undefined || value === "") return "";
    const shell = cleanPath(value, "shell");
    const known = (await status(hostId, s)).shells;
    if (
      known.length &&
      !known.includes(shell) &&
      !/nologin|false$/.test(shell)
    ) {
      throw new HostScriptError("That shell is not listed in /etc/shells");
    }
    return shell;
  };

  return {
    status,
    list,
    detail: async (hostId, s, name) => {
      const { raw: _raw, ...detail } = await readDetail(
        hostId,
        s,
        cleanName(name),
      );
      return detail;
    },
    sessions: async (hostId, s) =>
      parseSessions(
        (await remote.read(hostId, s.sudo, SESSIONS_SCRIPT)).stdout,
      ),
    create: async (hostId, s, body) => {
      const st = await status(hostId, s);
      if (!st.tools) {
        throw new HostScriptError(
          "useradd is not installed on this host. On Alpine, install the shadow package.",
        );
      }
      const groups = cleanNames(body.groups);
      if (body.sudo && st.sudoGroup && !groups.includes(st.sudoGroup)) {
        groups.push(st.sudoGroup);
      }
      await root(
        hostId,
        s,
        createScript({
          name: cleanName(body.name),
          comment: cleanComment(body.comment),
          shell: await shellOf(hostId, s, body.shell),
          home: body.home ? cleanPath(body.home, "home folder") : "",
          createHome: body.createHome !== false,
          groups,
          password: body.password ? cleanPassword(body.password) : "",
        }),
      );
    },
    update: async (hostId, s, name, body) => {
      await root(
        hostId,
        s,
        updateScript(cleanName(name), {
          comment:
            body.comment === undefined ? undefined : cleanComment(body.comment),
          shell:
            body.shell === undefined
              ? undefined
              : await shellOf(hostId, s, body.shell),
          groups:
            body.groups === undefined ? undefined : cleanNames(body.groups),
        }),
      );
    },
    setPassword: async (hostId, s, name, password) => {
      await root(
        hostId,
        s,
        passwordScript(cleanName(name), cleanPassword(password)),
      );
    },
    lock: async (hostId, s, name, lock) => {
      await root(hostId, s, lockScript(cleanName(name), lock));
    },
    expirePassword: async (hostId, s, name) => {
      await root(hostId, s, expirePasswordScript(cleanName(name)));
    },
    remove: async (hostId, s, name, removeHome) => {
      await root(hostId, s, deleteScript(cleanName(name), removeHome));
    },
    setSudo: async (hostId, s, name, on) => {
      const st = await status(hostId, s);
      if (!st.sudoGroup) {
        throw new HostScriptError("This host has no sudo or wheel group");
      }
      await root(
        hostId,
        s,
        groupMemberScript(cleanName(name), st.sudoGroup, on, st.sudoGroup),
      );
    },
    addKey: async (hostId, s, name, key) => {
      const user = cleanName(name);
      let line: string;
      try {
        line = checkNewKey(typeof key === "string" ? key : "");
      } catch (error) {
        throw new HostScriptError((error as Error).message);
      }
      const current = await readDetail(hostId, s, user);
      if (current.keysError)
        throw new HostScriptError("Could not read the keys");
      const base = current.raw.replace(/\n+$/, "");
      await root(
        hostId,
        s,
        writeKeysScript(user, `${base ? `${base}\n` : ""}${line}\n`),
      );
      const { raw: _raw, ...detail } = await readDetail(hostId, s, user);
      return detail;
    },
    removeKey: async (hostId, s, name, line, fingerprint) => {
      const user = cleanName(name);
      const current = await readDetail(hostId, s, user);
      const key = current.keys.find((item) => item.line === line);
      if (!key || key.fingerprint !== fingerprint) {
        throw new HostScriptError(
          "The keys changed on the host. Refresh and try again.",
          409,
        );
      }
      const lines = current.raw.split("\n");
      lines.splice(line, 1);
      const text = lines.join("\n").replace(/\n+$/, "");
      await root(hostId, s, writeKeysScript(user, text ? `${text}\n` : ""));
      const { raw: _raw, ...detail } = await readDetail(hostId, s, user);
      return detail;
    },
    createGroup: async (hostId, s, name) => {
      await root(hostId, s, createGroupScript(cleanName(name, "group")));
    },
    deleteGroup: async (hostId, s, name) => {
      const group = cleanName(name, "group");
      const found = (await list(hostId, s)).groups.find(
        (g) => g.name === group,
      );
      if (!found) throw new HostScriptError("No such group", 404);
      if (found.primaryOf.length) {
        throw new HostScriptError(
          `This is the main group of ${found.primaryOf.join(", ")}`,
        );
      }
      await root(hostId, s, deleteGroupScript(group));
    },
    setMember: async (hostId, s, group, user, add) => {
      const st = await status(hostId, s);
      await root(
        hostId,
        s,
        groupMemberScript(
          cleanName(user),
          cleanName(group, "group"),
          add,
          st.sudoGroup,
        ),
      );
    },
  };
}
