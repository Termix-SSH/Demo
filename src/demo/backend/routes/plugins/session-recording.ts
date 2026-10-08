import { del, get, HttpError } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/session-recording";

const PROMPT = "\x1b[1;32mdeploy@web-01\x1b[0m:\x1b[1;34m~\x1b[0m$ ";

/** Builds an asciicast v2 recording of someone typing a few commands. */
function cast(script: Array<[command: string, output: string[]]>): string {
  const events: Array<[number, "o", string]> = [];
  let t = 0.4;
  events.push([t, "o", PROMPT]);
  for (const [command, output] of script) {
    t += 0.8;
    for (const ch of command) {
      t += 0.06 + Math.random() * 0.08;
      events.push([Number(t.toFixed(3)), "o", ch]);
    }
    t += 0.3;
    events.push([Number(t.toFixed(3)), "o", "\r\n"]);
    for (const line of output) {
      t += 0.05;
      events.push([Number(t.toFixed(3)), "o", `${line}\r\n`]);
    }
    t += 0.2;
    events.push([Number(t.toFixed(3)), "o", PROMPT]);
  }
  const header = JSON.stringify({
    version: 2,
    width: 110,
    height: 28,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return [header, ...events.map((e) => JSON.stringify(e))].join("\n") + "\n";
}

const RECORDINGS: Record<number, string> = {
  1: cast([
    [
      "cd ~/app && git pull",
      [
        "Updating 4e1a9f2..9f3c2e1",
        "Fast-forward",
        " src/server.js | 12 ++++++++----",
        " 1 file changed, 8 insertions(+), 4 deletions(-)",
      ],
    ],
    [
      "docker compose up -d --build app",
      [
        "[+] Building 18.4s (12/12) FINISHED",
        "[+] Running 1/1",
        " \u2714 Container app  Started",
      ],
    ],
    [
      "curl -s localhost:3000/api/health",
      ['{"status":"ok","version":"2.4.1"}'],
    ],
  ]),
  2: cast([
    [
      "sudo -u postgres psql -c 'select now()'",
      [
        "              now",
        "-------------------------------",
        " 2026-10-08 09:41:12.554213+00",
        "(1 row)",
      ],
    ],
    [
      "df -h /var/lib/postgresql",
      [
        "Filesystem      Size  Used Avail Use% Mounted on",
        "/dev/sdb1       500G  311G  189G  63% /var/lib/postgresql",
      ],
    ],
  ]),
  3: cast([
    ["sudo systemctl restart pihole-FTL", []],
    [
      "pihole status",
      [
        "  [\u2713] FTL is listening on port 53",
        "  [\u2713] Pi-hole blocking is enabled",
      ],
    ],
  ]),
};

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const logs = collection("recordings", () => [
  {
    id: 1,
    hostId: 1,
    userId: "demo-user",
    startedAt: ago(95),
    endedAt: ago(93),
    duration: 118,
    recordingPath: "1.cast",
    hostName: "web-01",
    hostIp: "10.0.12.21",
    sizeBytes: RECORDINGS[1].length,
    protocol: "ssh",
    format: "asciicast",
    username: "deploy",
  },
  {
    id: 2,
    hostId: 3,
    userId: "demo-user",
    startedAt: ago(400),
    endedAt: ago(396),
    duration: 241,
    recordingPath: "2.cast",
    hostName: "db-primary",
    hostIp: "10.0.12.40",
    sizeBytes: RECORDINGS[2].length,
    protocol: "ssh",
    format: "asciicast",
    username: "postgres",
  },
  {
    id: 3,
    hostId: 9,
    userId: "demo-user",
    startedAt: ago(1500),
    endedAt: ago(1499),
    duration: 52,
    recordingPath: "3.cast",
    hostName: "pihole",
    hostIp: "192.168.1.31",
    sizeBytes: RECORDINGS[3].length,
    protocol: "ssh",
    format: "asciicast",
    username: "pi",
  },
]);

get(`${P}/`, () => ({ logs: logs.all() }));
get(`${P}/:id/content`, (req) => {
  const body = RECORDINGS[Number(req.params.id)];
  if (!body) throw new HttpError(404, { error: "Recording not found" });
  return body;
});
del(`${P}/:id`, (req) => {
  logs.remove(req.params.id);
  return { success: true };
});
