import { del, get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/git";

interface Repo {
  path: string;
  name: string;
  branch: string;
  detached: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  changed: number;
  untracked: number;
  conflicts: number;
  stashes: number;
  remoteUrl: string;
  last: { hash: string; subject: string; author: string; date: string };
  auto?: {
    enabled: boolean;
    intervalMin: number;
    postCommand: string;
    runs: Array<{ at: string; outcome: string; message: string }>;
  };
}

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const repo = (r: Partial<Repo> & Pick<Repo, "path" | "name">): Repo => ({
  branch: "main",
  detached: false,
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  changed: 0,
  untracked: 0,
  conflicts: 0,
  stashes: 0,
  remoteUrl: `git@github.com:acme/${r.name}.git`,
  last: {
    hash: "9f3c1e2a7b4d5c6e8f901a2b3c4d5e6f70812345",
    subject: "Bump dependencies",
    author: "Dana Reyes",
    date: ago(180),
  },
  ...r,
});

const repos = value<Repo[]>("git-repos", () => [
  repo({
    path: "/srv/app",
    name: "app",
    behind: 2,
    changed: 3,
    untracked: 1,
    auto: {
      enabled: true,
      intervalMin: 15,
      postCommand: "systemctl reload app",
      runs: [
        { at: ago(12), outcome: "uptodate", message: "Already up to date" },
        { at: ago(130), outcome: "pulled", message: "Fast-forward, 4 files" },
      ],
    },
  }),
  repo({ path: "/srv/infra", name: "infra", ahead: 1, stashes: 1 }),
  repo({ path: "/home/deploy/dotfiles", name: "dotfiles" }),
]);

const byPath = (path: string) => repos.get().find((r) => r.path === path);

get(`${P}/summary`, () => [
  {
    hostId: 1,
    checkedAt: new Date().toISOString(),
    repos: repos.get().map((r) => ({
      path: r.path,
      name: r.name,
      branch: r.branch,
      ahead: r.ahead,
      behind: r.behind,
      changed: r.changed,
      untracked: r.untracked,
      conflicts: r.conflicts,
      failing: false,
    })),
  },
]);

get(`${P}/:host/status`, () => ({
  installed: true,
  version: "git version 2.47.3",
  user: "deploy",
  roots: ["/srv", "/home/deploy"],
  canEdit: true,
  readOnly: false,
  canRunCommands: true,
}));
get(`${P}/:host/repos`, () => ({ repos: repos.get() }));
get(`${P}/:host/discover`, () => ({ found: ["/srv/blog", "/opt/tools"] }));
post(`${P}/:host/repos`, (req) => {
  const { path } = req.body as { path: string };
  if (!byPath(path)) {
    repos.update((r) => [
      ...r,
      repo({ path, name: path.split("/").filter(Boolean).pop() ?? path }),
    ]);
  }
  return { ok: true };
});
del(`${P}/:host/repos`, (req) => {
  repos.update((r) => r.filter((x) => x.path !== req.query.path));
  return { ok: true };
});
post(`${P}/:host/clone`, (req) => {
  const { url, dest } = req.body as { url?: string; dest?: string };
  const path = dest || "/srv/cloned";
  repos.update((r) => [
    ...r,
    repo({
      path,
      name: path.split("/").pop() ?? "cloned",
      remoteUrl: url ?? "",
    }),
  ]);
  return { ok: true, output: "Cloning done", path };
});

get(`${P}/:host/repo/status`, (req) => {
  const r = byPath(req.query.path) ?? repos.get()[0];
  const files = [
    { path: "src/server.ts", index: ".", tree: "M" },
    { path: "src/routes/health.ts", index: "M", tree: "." },
    { path: "README.md", index: ".", tree: "M" },
    { path: "notes.txt", index: "?", tree: "?", untracked: true },
  ].slice(0, r.changed + r.untracked);
  return {
    branch: r.branch,
    detached: r.detached,
    upstream: r.upstream,
    ahead: r.ahead,
    behind: r.behind,
    files,
  };
});
get(`${P}/:host/repo/log`, () => ({
  commits: [
    [
      "9f3c1e2",
      "Bump dependencies",
      "Dana Reyes",
      180,
      ["HEAD -> main", "origin/main"],
    ],
    ["4b7a8d1", "Fix health check timeout", "Sam Okafor", 1500, []],
    ["c21e0f9", "Add metrics endpoint", "Dana Reyes", 3100, []],
    ["81d5a37", "Initial import", "Sam Okafor", 9000, []],
  ].map(([short, subject, author, min, refs]) => ({
    hash: `${short}0000000000000000000000000000000`,
    short,
    author,
    date: ago(min as number),
    refs,
    subject,
  })),
}));
get(`${P}/:host/repo/commit`, (req) => ({
  commit: {
    hash: String(req.query.hash ?? ""),
    short: String(req.query.hash ?? "").slice(0, 7),
    author: "Dana Reyes",
    date: ago(180),
    refs: [],
    subject: "Bump dependencies",
  },
  body: "Routine update of the lock file.",
  stat: " package.json | 4 ++--\n 1 file changed, 2 insertions(+), 2 deletions(-)",
  diff: 'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -8,3 +8,3 @@\n-    "express": "^4.19.0"\n+    "express": "^4.21.2"\n',
  truncated: false,
}));
get(`${P}/:host/repo/diff`, () => ({
  text: 'diff --git a/src/server.ts b/src/server.ts\n--- a/src/server.ts\n+++ b/src/server.ts\n@@ -12,3 +12,4 @@\n   app.listen(port);\n+  log.info("ready");\n',
  truncated: false,
}));
get(`${P}/:host/repo/branches`, () => ({
  branches: [
    {
      name: "main",
      current: true,
      remote: false,
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      gone: false,
      hash: "9f3c1e2",
      subject: "Bump dependencies",
    },
    {
      name: "feature/metrics",
      current: false,
      remote: false,
      upstream: "",
      ahead: 2,
      behind: 0,
      gone: false,
      hash: "c21e0f9",
      subject: "Add metrics endpoint",
    },
    {
      name: "origin/main",
      current: false,
      remote: true,
      upstream: "",
      ahead: 0,
      behind: 0,
      gone: false,
      hash: "9f3c1e2",
      subject: "Bump dependencies",
    },
  ],
}));
get(`${P}/:host/repo/remotes`, () => ({
  remotes: [
    {
      name: "origin",
      fetch: "git@github.com:acme/app.git",
      push: "git@github.com:acme/app.git",
    },
  ],
}));
get(`${P}/:host/repo/stashes`, () => ({
  stashes: [{ index: 0, name: "stash@{0}", message: "WIP on main: 9f3c1e2" }],
}));
put(`${P}/:host/repo/auto`, (req) => {
  const body = req.body as {
    path: string;
    enabled?: boolean;
    intervalMin?: number;
  };
  repos.update((all) =>
    all.map((r) =>
      r.path === body.path
        ? {
            ...r,
            auto: {
              postCommand: "",
              runs: [],
              ...r.auto,
              enabled: !!body.enabled,
              intervalMin: body.intervalMin ?? 15,
            },
          }
        : r,
    ),
  );
  return { auto: byPath(body.path)?.auto };
});
post(`${P}/:host/repo/auto/run`, () => ({
  run: { at: ago(0), outcome: "uptodate", message: "Already up to date" },
}));
del(`${P}/:host/repo/branch`, () => ({ ok: true, output: "Deleted branch" }));
post(`${P}/:host/repo/:name`, (req) => ({
  ok: true,
  output: `${req.params.name} done`,
}));
