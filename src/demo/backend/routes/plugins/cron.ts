import { del, get, HttpError, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/cron";

interface Job {
  id: string;
  enabled: boolean;
  schedule: string;
  command: string;
  label: string;
}

let next = 100;
const job = (
  schedule: string,
  command: string,
  label = "",
  enabled = true,
): Job => ({
  id: (next++).toString(16).padStart(8, "0"),
  schedule,
  command,
  label,
  enabled,
});

const state = value<Record<string, Job[]>>("cron-state", () => ({
  "": [
    job(
      "0 3 * * *",
      "/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1",
      "Nightly backup",
    ),
    job("*/5 * * * *", "/opt/healthcheck/ping", "Health ping"),
    job("30 2 * * 0", "/usr/bin/certbot renew --quiet", "", false),
    job("@reboot", "/srv/app/start.sh"),
  ],
  root: [job("15 4 * * 1", "apt-get -qq update", "Weekly index refresh")],
  "www-data": [job("*/10 * * * *", "php /var/www/app/artisan schedule:run")],
}));

const raw = (jobs: Job[]) =>
  jobs
    .flatMap((j) => [
      ...(j.label ? [`# ${j.label}`] : []),
      `${j.enabled ? "" : "# "}${j.schedule} ${j.command}`,
    ])
    .join("\n") + "\n";

const view = (user: string) => {
  const jobs = state.get()[user] ?? [];
  return { user, jobs, raw: raw(jobs) };
};

const userOf = (value: unknown) => (typeof value === "string" ? value : "");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function update(user: string, fn: (jobs: Job[]) => Job[]) {
  state.update((s) => ({ ...s, [user]: fn(s[user] ?? []) }));
  return view(user);
}

function find(user: string, id: string): Job {
  const found = (state.get()[user] ?? []).find((j) => j.id === id);
  if (!found)
    throw new HttpError(409, {
      error: "This job changed. Refresh and try again.",
    });
  return found;
}

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  user: "deploy",
  root: true,
  installed: true,
  running: true,
  timezone: "Europe/Berlin",
  offsetMinutes: 60,
  users: ["deploy", "root", "www-data"],
  canEdit: true,
  readOnly: false,
}));
get(`${P}/:host/jobs`, (req) => view(userOf(req.query.user)));
post(`${P}/:host/jobs`, (req) => {
  const b = req.body as Partial<Job> & { user?: string };
  return update(userOf(b.user), (jobs) => [
    ...jobs,
    job(
      b.schedule ?? "* * * * *",
      b.command ?? "",
      b.label ?? "",
      b.enabled !== false,
    ),
  ]);
});
put(`${P}/:host/jobs/:id`, (req) => {
  const b = req.body as Partial<Job> & { user?: string };
  const user = userOf(b.user);
  find(user, req.params.id);
  return update(user, (jobs) =>
    jobs.map((j) => (j.id === req.params.id ? { ...j, ...b, id: j.id } : j)),
  );
});
post(`${P}/:host/jobs/:id/state`, (req) => {
  const b = req.body as { user?: string; enabled?: boolean };
  return update(userOf(b.user), (jobs) =>
    jobs.map((j) =>
      j.id === req.params.id ? { ...j, enabled: b.enabled === true } : j,
    ),
  );
});
del(`${P}/:host/jobs/:id`, (req) =>
  update(userOf(req.query.user), (jobs) =>
    jobs.filter((j) => j.id !== req.params.id),
  ),
);
post(`${P}/:host/jobs/:id/run`, async (req) => {
  const found = find(
    userOf((req.body as { user?: string })?.user),
    req.params.id,
  );
  await wait(900);
  return {
    output: `Ran ${found.command}\nThis is a demo, so nothing ran on a real host.`,
    code: 0,
  };
});
put(`${P}/:host/crontab`, () => {
  throw new HttpError(400, {
    error: "Editing as text is not available in the demo.",
  });
});
get(`${P}/:host/system`, () => ({
  files: [
    {
      path: "/etc/crontab",
      name: "",
      editable: false,
      text: "",
      jobs: [
        {
          enabled: true,
          schedule: "17 * * * *",
          user: "root",
          command: "cd / && run-parts --report /etc/cron.hourly",
        },
        {
          enabled: true,
          schedule: "25 6 * * *",
          user: "root",
          command:
            "test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily",
        },
      ],
    },
    {
      path: "/etc/cron.d/certbot",
      name: "certbot",
      editable: true,
      text: "0 */12 * * * root certbot -q renew\n",
      jobs: [
        {
          enabled: true,
          schedule: "0 */12 * * *",
          user: "root",
          command: "certbot -q renew",
        },
      ],
    },
  ],
  scripts: {
    hourly: [],
    daily: ["apt-compat", "dpkg", "logrotate", "man-db"],
    weekly: ["man-db"],
    monthly: [],
  },
  timers: 14,
}));
put(`${P}/:host/system/:name`, () => ({ ok: true }));
del(`${P}/:host/system/:name`, () => ({ ok: true }));
get(`${P}/:host/logs`, () => ({
  source: "journal",
  text: Array.from({ length: 30 }, (_, i) => {
    const at = new Date(Date.now() - (30 - i) * 300_000)
      .toISOString()
      .slice(0, 19);
    return `${at}+00:00 web-01 CRON[${4100 + i}]: (deploy) CMD (/opt/healthcheck/ping)`;
  }).join("\n"),
}));
