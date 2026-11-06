import { del, get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/ansible";

type RunState = "running" | "ok" | "failed" | "cancelled" | "lost";

interface Run {
  id: string;
  kind: "playbook" | "adhoc" | "facts";
  title: string;
  command: string;
  startedAt: number;
  startedBy: string;
  check: boolean;
  hosts: string[];
  state: RunState;
  exitCode: number | null;
  endedAt: number | null;
  log: string;
  recap: Array<{
    host: string;
    ok: number;
    changed: number;
    unreachable: number;
    failed: number;
    skipped: number;
  }>;
}

const now = Date.now();
const MIN = 60_000;

const files = value<Record<string, string>>("ansible-files", () => ({
  "site.yml":
    "- hosts: all\n  become: true\n  roles:\n    - common\n    - nginx\n",
  "playbooks/update.yml":
    "- hosts: all\n  become: true\n  tasks:\n    - name: Upgrade packages\n      ansible.builtin.apt:\n        upgrade: dist\n        update_cache: true\n",
  "playbooks/users.yml":
    "- hosts: all\n  become: true\n  tasks:\n    - name: Ensure deploy user\n      ansible.builtin.user:\n        name: deploy\n        shell: /bin/bash\n",
  "inventory/hosts.ini": "[web]\nweb-01\nweb-02\n\n[db]\ndb-primary\n",
  "ansible.cfg": "[defaults]\ninventory = inventory/hosts.ini\n",
}));

const runs = value<Run[]>("ansible-runs", () => [
  {
    id: "1730800000-a1b2c3",
    kind: "playbook",
    title: "playbooks/update.yml",
    command: "ansible-playbook playbooks/update.yml",
    startedAt: now - 50 * MIN,
    startedBy: "demo",
    check: false,
    hosts: ["web-01", "web-02"],
    state: "ok",
    exitCode: 0,
    endedAt: now - 48 * MIN,
    log: "PLAY [all] *****\n\nTASK [Upgrade packages] *****\nchanged: [web-01]\nchanged: [web-02]\n\nPLAY RECAP *****\nweb-01 : ok=2 changed=1 unreachable=0 failed=0\nweb-02 : ok=2 changed=1 unreachable=0 failed=0\n",
    recap: [
      {
        host: "web-01",
        ok: 2,
        changed: 1,
        unreachable: 0,
        failed: 0,
        skipped: 0,
      },
      {
        host: "web-02",
        ok: 2,
        changed: 1,
        unreachable: 0,
        failed: 0,
        skipped: 0,
      },
    ],
  },
  {
    id: "1730700000-d4e5f6",
    kind: "playbook",
    title: "playbooks/users.yml",
    command: "ansible-playbook playbooks/users.yml",
    startedAt: now - 26 * 60 * MIN,
    startedBy: "demo",
    check: false,
    hosts: ["db-primary"],
    state: "failed",
    exitCode: 2,
    endedAt: now - 26 * 60 * MIN + 40_000,
    log: "TASK [Ensure deploy user] *****\nfatal: [db-primary]: FAILED! => permission denied\n",
    recap: [
      {
        host: "db-primary",
        ok: 1,
        changed: 0,
        unreachable: 0,
        failed: 1,
        skipped: 0,
      },
    ],
  },
]);

get(`${P}/summary`, () => [
  {
    hostId: 6,
    checkedAt: new Date().toISOString(),
    running: 0,
    failed: 1,
    last: {
      id: "1730800000-a1b2c3",
      title: "playbooks/update.yml",
      state: "ok",
      startedAt: now - 50 * MIN,
    },
  },
]);

get(`${P}/:host/status`, () => ({
  installed: true,
  version: "ansible [core 2.17.4]",
  user: "jump",
  projectDir: "/home/jump/ansible",
  projectExists: true,
  sshpass: true,
  canEdit: true,
  readOnly: false,
}));

get(`${P}/:host/files`, () => ({
  files: Object.entries(files.get()).map(([path, text]) => ({
    path,
    size: text.length,
    modified: now - 3 * 60 * MIN,
    playbook: path.endsWith(".yml"),
  })),
}));
get(`${P}/:host/file`, (req) => ({
  path: req.query.path,
  text: files.get()[req.query.path] ?? "",
}));
put(`${P}/:host/file`, (req) => {
  const { path, text } = req.body as { path: string; text: string };
  files.update((f) => ({ ...f, [path]: text }));
  return { ok: true };
});
del(`${P}/:host/file`, (req) => {
  files.update((f) => {
    const { [req.query.path]: _gone, ...rest } = f;
    return rest;
  });
  return { ok: true };
});

get(`${P}/:host/targets`, () => ({
  targets: [
    {
      id: 1,
      name: "web-01",
      address: "10.0.12.21",
      folder: "Production",
      tags: ["nginx"],
    },
    {
      id: 2,
      name: "web-02",
      address: "10.0.12.22",
      folder: "Production",
      tags: ["nginx"],
    },
    {
      id: 3,
      name: "db-primary",
      address: "10.0.12.40",
      folder: "Production",
      tags: ["postgres"],
    },
    {
      id: 5,
      name: "cache-01",
      address: "10.0.12.55",
      folder: "Production",
      tags: ["redis"],
    },
  ],
}));

const summary = (r: Run) => {
  const { log: _l, recap: _r, ...rest } = r;
  return rest;
};

get(`${P}/:host/runs`, () => ({ runs: runs.get().map(summary) }));
get(`${P}/:host/runs/:id`, (req) => {
  const r = runs.get().find((x) => x.id === req.params.id);
  return r ? { ...r, truncated: false } : { error: "Run not found" };
});
get(`${P}/:host/runs/:id/facts`, () => ({
  hosts: [
    {
      host: "web-01",
      ok: true,
      message: "",
      facts: {
        ansible_distribution: "Debian",
        ansible_distribution_version: "13",
        ansible_processor_vcpus: 4,
        ansible_memtotal_mb: 7937,
      },
    },
  ],
}));
post(`${P}/:host/runs`, (req) => {
  const b = req.body as {
    kind: Run["kind"];
    playbook?: string;
    check?: boolean;
  };
  const run: Run = {
    id: `${Date.now()}-demo01`,
    kind: b.kind,
    title: b.playbook ?? "ad-hoc",
    command: `ansible-playbook ${b.playbook ?? ""}`.trim(),
    startedAt: Date.now(),
    startedBy: "demo",
    check: !!b.check,
    hosts: ["web-01", "web-02"],
    state: "ok",
    exitCode: 0,
    endedAt: Date.now() + 4000,
    log: "PLAY RECAP *****\nweb-01 : ok=3 changed=0 unreachable=0 failed=0\nweb-02 : ok=3 changed=0 unreachable=0 failed=0\n",
    recap: [
      {
        host: "web-01",
        ok: 3,
        changed: 0,
        unreachable: 0,
        failed: 0,
        skipped: 0,
      },
      {
        host: "web-02",
        ok: 3,
        changed: 0,
        unreachable: 0,
        failed: 0,
        skipped: 0,
      },
    ],
  };
  runs.update((r) => [run, ...r]);
  return summary(run);
});
post(`${P}/:host/runs/:id/cancel`, () => ({ ok: true }));
del(`${P}/:host/runs/:id`, (req) => {
  runs.update((r) => r.filter((x) => x.id !== req.params.id));
  return { ok: true };
});
