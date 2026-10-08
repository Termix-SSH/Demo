// tmux sessions running on the hosts that have Tmux Monitor turned on.

export interface TmuxPaneSeed {
  id: string;
  command: string;
  path: string;
  title: string;
  output: string[];
}

export interface TmuxSessionSeed {
  name: string;
  tags: string[];
  attached: number;
  windows: Array<{ name: string; panes: TmuxPaneSeed[] }>;
}

const now = Math.floor(Date.now() / 1000);
export const TMUX_CREATED = now - 86400 * 4;

export const TMUX_SESSIONS: TmuxSessionSeed[] = [
  {
    name: "deploy",
    tags: ["prod"],
    attached: 1,
    windows: [
      {
        name: "logs",
        panes: [
          {
            id: "%1",
            command: "tail",
            path: "/var/log/nginx",
            title: "access.log",
            output: [
              '10.0.0.24 - - [08/Oct/2026:09:12:01] "GET / HTTP/2.0" 200 5120',
              '10.0.0.24 - - [08/Oct/2026:09:12:02] "GET /api/health HTTP/2.0" 200 17',
              '10.0.0.31 - - [08/Oct/2026:09:13:44] "POST /api/orders HTTP/2.0" 201 88',
              '203.0.113.45 - - [08/Oct/2026:09:14:40] "GET /wp-login.php HTTP/1.1" 404 162',
              '10.0.0.24 - - [08/Oct/2026:09:15:10] "GET /assets/app.js HTTP/2.0" 200 48211',
            ],
          },
          {
            id: "%2",
            command: "bash",
            path: "/home/deploy",
            title: "shell",
            output: [
              "deploy@web-01:~$ ./deploy.sh",
              "Deployed 2026-10-08",
              "deploy@web-01:~$ ",
            ],
          },
        ],
      },
      {
        name: "htop",
        panes: [
          {
            id: "%3",
            command: "htop",
            path: "/home/deploy",
            title: "htop",
            output: [
              "  CPU[||||||          34.1%]   Tasks: 187, 412 thr; 2 running",
              "  Mem[||||||||||    4.7G/7.7G]   Load average: 0.42 0.37 0.31",
              "  Swp[                0K/2.0G]   Uptime: 23 days, 04:12:40",
              "",
              "    PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%   TIME+  Command",
              "    882 root       20   0 2.1G  110M 48112 S  4.3  1.4 98:12.40 dockerd",
              "   1423 www-data   20   0 56132 47100  9220 S  2.0  0.6 22:41.07 nginx",
            ],
          },
        ],
      },
    ],
  },
  {
    name: "migrations",
    tags: ["db"],
    attached: 0,
    windows: [
      {
        name: "psql",
        panes: [
          {
            id: "%4",
            command: "psql",
            path: "/home/deploy",
            title: "psql",
            output: [
              "app=> select count(*) from orders where created_at > now() - interval '1 day';",
              " count ",
              "-------",
              "  4182",
              "(1 row)",
              "",
              "app=> ",
            ],
          },
        ],
      },
    ],
  },
  {
    name: "scratch",
    tags: [],
    attached: 0,
    windows: [
      {
        name: "bash",
        panes: [
          {
            id: "%5",
            command: "bash",
            path: "/tmp",
            title: "bash",
            output: ["deploy@web-01:/tmp$ "],
          },
        ],
      },
    ],
  },
];

export function findTmuxSession(name: string): TmuxSessionSeed | undefined {
  return TMUX_SESSIONS.find((s) => s.name === name);
}
