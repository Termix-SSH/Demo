export interface InventoryHost {
  id: number;
  name: string;
  ip: string;
  port: number;
  username: string;
  folder: string;
  tags: string[];
  password?: string;
  key?: string;
  keyPassword?: string;
  sudoPassword?: string;
  /** The control host itself: no SSH needed. */
  local: boolean;
}

export interface BuiltInventory {
  json: string;
  keys: Record<string, string>;
  /** Alias per host id, as Ansible sees the host. */
  aliases: Record<number, string>;
  /** Hosts that were left out and why. */
  skipped: Array<{ id: number; reason: string }>;
}

function slug(value: string, allow: RegExp, fallback: string): string {
  const text = value
    .toLowerCase()
    .replace(allow, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return text || fallback;
}

export const hostAlias = (name: string) => slug(name, /[^a-z0-9_.-]+/g, "host");

/** Group names allow letters, digits and underscores. */
export const groupName = (prefix: string, value: string) =>
  `${prefix}_${slug(value, /[^a-z0-9]+/g, "x").replace(/-/g, "_")}`;

/**
 * The inventory Ansible reads for Termix hosts. Folders become folder_*
 * groups and tags become tag_* groups. Secrets stay in this one file, which
 * the run script deletes when the run ends.
 */
export function buildInventory(hosts: InventoryHost[]): BuiltInventory {
  const used = new Set<string>();
  const aliases: Record<number, string> = {};
  const keys: Record<string, string> = {};
  const skipped: BuiltInventory["skipped"] = [];
  const members: Record<string, Record<string, Record<string, never>>> = {};
  const all: Record<string, Record<string, unknown>> = {};

  const join = (group: string, alias: string) => {
    (members[group] ??= {})[alias] = {};
  };

  for (const host of hosts) {
    let alias = hostAlias(host.name);
    if (used.has(alias)) alias = `${alias}-${host.id}`;
    used.add(alias);
    aliases[host.id] = alias;

    const vars: Record<string, unknown> = {};
    if (host.local) {
      vars.ansible_connection = "local";
    } else {
      vars.ansible_host = host.ip;
      vars.ansible_port = host.port;
      vars.ansible_user = host.username;
      if (host.key) {
        if (host.keyPassword) {
          delete aliases[host.id];
          used.delete(alias);
          skipped.push({
            id: host.id,
            reason: "keyPassphrase",
          });
          continue;
        }
        const file = `h${host.id}`;
        keys[file] = host.key;
        vars.ansible_ssh_private_key_file = `@@D@@/secret/keys/${file}`;
      } else if (host.password) {
        vars.ansible_password = host.password;
      }
    }
    if (host.sudoPassword) vars.ansible_become_password = host.sudoPassword;
    all[alias] = vars;

    join("termix", alias);
    if (host.folder) {
      for (const part of folderChain(host.folder)) {
        join(groupName("folder", part), alias);
      }
    }
    for (const tag of host.tags) join(groupName("tag", tag), alias);
  }

  const children: Record<string, { hosts: Record<string, never> }> = {};
  for (const [group, list] of Object.entries(members)) {
    children[group] = { hosts: list as Record<string, never> };
  }

  return {
    json: JSON.stringify({ all: { hosts: all, children } }),
    keys,
    aliases,
    skipped,
  };
}

/** "a/b" gives "a/b" and "a", so a parent folder group has its children. */
function folderChain(folder: string): string[] {
  const parts = folder.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}
