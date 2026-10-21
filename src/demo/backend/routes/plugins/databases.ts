import { del, get, HttpError, post, put } from "../../router";
import { collection, value } from "../../store";

const P = "/plugin-api/databases";

type Engine = "mysql" | "postgres" | "sqlite";
type Cell = string | null;

interface Connection {
  id: number;
  hostId: number;
  name: string;
  engine: Engine;
  address: string;
  port: number | null;
  username: string;
  hasPassword: boolean;
  database: string;
  runAs: string;
  readOnly: boolean;
}

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  default: string | null;
  extra: string;
  editable: boolean;
}

interface Table {
  name: string;
  kind: "table" | "view";
  columns: Column[];
  indexes: Array<{ name: string; definition: string }>;
  rows: Cell[][];
}

const col = (
  name: string,
  type: string,
  extra: Partial<Column> = {},
): Column => ({
  name,
  type,
  nullable: false,
  primary: false,
  default: null,
  extra: "",
  editable: true,
  ...extra,
});

const day = (n: number) =>
  new Date(Date.UTC(2026, 9, 21) - n * 864e5).toISOString().slice(0, 10);

const FIRST = ["ann", "bob", "carla", "dev", "elena", "farid", "greta", "hugo"];
const LAST = ["park", "silva", "novak", "berg", "okafor", "lind"];
const PLANS = ["free", "pro", "team", "pro", "free", "enterprise"];

function seedTables(): Record<string, Table> {
  const users: Cell[][] = [];
  for (let n = 1; n <= 48; n++) {
    const first = FIRST[n % FIRST.length];
    const last = LAST[(n * 5) % LAST.length];
    users.push([
      String(n),
      `${first}.${last}${n > 8 ? n : ""}@example.com`,
      `${first[0].toUpperCase()}${first.slice(1)} ${last[0].toUpperCase()}${last.slice(1)}`,
      PLANS[n % PLANS.length],
      day(400 - n * 7),
      n % 9 === 0 ? null : day(n % 12),
    ]);
  }
  const products: Cell[][] = [
    ["1", "TX-100", "Rack shelf", "49.00", "120"],
    ["2", "TX-210", "Patch cable 2m", "6.50", "940"],
    ["3", "TX-305", "1U blanking panel", "8.00", "310"],
    ["4", "TX-410", "PDU 8 port", "189.00", "22"],
    ["5", "TX-520", "Cable manager", "24.00", "75"],
    ["6", "TX-630", "SFP+ module", "39.00", "64"],
    ["7", "TX-740", "Cage nuts 50 pack", "12.00", "410"],
    ["8", "TX-850", "Rail kit", "59.00", "0"],
  ];
  const STATUS = ["paid", "shipped", "paid", "refunded", "pending", "shipped"];
  const orders: Cell[][] = [];
  for (let n = 1; n <= 120; n++) {
    orders.push([
      String(1000 + n),
      String(((n * 7) % 48) + 1),
      (((n * 37) % 400) + 12.5).toFixed(2),
      STATUS[n % STATUS.length],
      day(Math.floor(n / 3)),
    ]);
  }
  return {
    users: {
      name: "users",
      kind: "table",
      columns: [
        col("id", "integer", {
          primary: true,
          default: "nextval('users_id_seq')",
          editable: false,
        }),
        col("email", "character varying(255)"),
        col("name", "text"),
        col("plan", "text", { default: "'free'" }),
        col("created_at", "date", { default: "CURRENT_DATE" }),
        col("last_login", "date", { nullable: true }),
      ],
      indexes: [
        { name: "users_pkey", definition: "PRIMARY KEY (id)" },
        { name: "users_email_key", definition: "UNIQUE (email)" },
      ],
      rows: users,
    },
    orders: {
      name: "orders",
      kind: "table",
      columns: [
        col("id", "integer", { primary: true, editable: false }),
        col("user_id", "integer"),
        col("total", "numeric(10,2)"),
        col("status", "text", { default: "'pending'" }),
        col("created_at", "date"),
      ],
      indexes: [
        { name: "orders_pkey", definition: "PRIMARY KEY (id)" },
        { name: "orders_user_id_idx", definition: "btree (user_id)" },
        { name: "orders_status_idx", definition: "btree (status)" },
      ],
      rows: orders,
    },
    products: {
      name: "products",
      kind: "table",
      columns: [
        col("id", "integer", { primary: true, editable: false }),
        col("sku", "text"),
        col("name", "text"),
        col("price", "numeric(8,2)"),
        col("stock", "integer", { default: "0" }),
      ],
      indexes: [
        { name: "products_pkey", definition: "PRIMARY KEY (id)" },
        { name: "products_sku_key", definition: "UNIQUE (sku)" },
      ],
      rows: products,
    },
    active_users: {
      name: "active_users",
      kind: "view",
      columns: [
        col("id", "integer", { editable: false }),
        col("email", "character varying(255)", { editable: false }),
        col("last_login", "date", { editable: false }),
      ],
      indexes: [],
      rows: [],
    },
  };
}

const connections = collection<Connection>("databases-connections", () => [
  {
    id: 1,
    hostId: 3,
    name: "app",
    engine: "postgres",
    address: "127.0.0.1",
    port: 5432,
    username: "app",
    hasPassword: true,
    database: "app",
    runAs: "",
    readOnly: false,
  },
  {
    id: 2,
    hostId: 3,
    name: "app (read only)",
    engine: "postgres",
    address: "127.0.0.1",
    port: 5432,
    username: "reporting",
    hasPassword: true,
    database: "app",
    runAs: "",
    readOnly: true,
  },
  {
    id: 3,
    hostId: 3,
    name: "local socket",
    engine: "postgres",
    address: "",
    port: null,
    username: "postgres",
    hasPassword: false,
    database: "",
    runAs: "postgres",
    readOnly: false,
  },
]);

const data = value<Record<string, Table>>("databases-tables", seedTables);

function view(c: Connection) {
  const { hostId: _h, ...rest } = c;
  return rest;
}

function connection(req: { params: Record<string, string> }): Connection {
  const found = connections.find(req.params.conn);
  if (!found || String(found.hostId) !== req.params.host) {
    throw new HttpError(404, { error: "Login not found" });
  }
  return found;
}

function table(name: string): Table {
  const found = data.get()[name];
  if (!found) {
    throw new HttpError(400, {
      error: `ERROR:  relation "${name}" does not exist`,
    });
  }
  return found;
}

function rowsOf(t: Table): Cell[][] {
  if (t.kind !== "view") return t.rows;
  const users = data.get().users;
  return users.rows.filter((r) => r[5] !== null).map((r) => [r[0], r[1], r[5]]);
}

// A small WHERE: col = 'x', col = 1, col LIKE '%x%', col > 1, joined by AND.
function matcher(columns: Column[], where: string) {
  const parts = where.trim() ? where.split(/\s+and\s+/i) : [];
  const tests = parts.map((part) => {
    const m =
      /^\s*"?(\w+)"?\s*(=|!=|<>|>=|<=|>|<|like|ilike)\s*(.+?)\s*$/i.exec(part);
    if (!m) {
      throw new HttpError(400, {
        error: `ERROR:  syntax error at or near "${part.trim().split(/\s+/)[0]}"`,
      });
    }
    const index = columns.findIndex((c) => c.name === m[1]);
    if (index < 0) {
      throw new HttpError(400, {
        error: `ERROR:  column "${m[1]}" does not exist`,
      });
    }
    const op = m[2].toLowerCase();
    const raw = m[3].replace(/^'(.*)'$/, "$1");
    return (row: Cell[]) => {
      const cell = row[index];
      if (cell === null) return false;
      if (op === "like" || op === "ilike") {
        const re = new RegExp(
          `^${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
          "i",
        );
        return re.test(cell);
      }
      const a = Number(cell);
      const b = Number(raw);
      const numeric = !Number.isNaN(a) && !Number.isNaN(b);
      const cmp = numeric ? a - b : cell.localeCompare(raw);
      if (op === "=") return cmp === 0;
      if (op === "!=" || op === "<>") return cmp !== 0;
      if (op === ">") return cmp > 0;
      if (op === "<") return cmp < 0;
      if (op === ">=") return cmp >= 0;
      return cmp <= 0;
    };
  });
  return (row: Cell[]) => tests.every((fn) => fn(row));
}

function sorted(columns: Column[], rows: Cell[][], by: string, dir: string) {
  const index = columns.findIndex((c) => c.name === by);
  if (index < 0) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((x, y) => {
    const a = x[index] ?? "";
    const b = y[index] ?? "";
    const na = Number(a);
    const nb = Number(b);
    if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) {
      return (na - nb) * sign;
    }
    return a.localeCompare(b) * sign;
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

get(`${P}/:host/tools`, () => ({
  mysql: null,
  psql: "/usr/bin/psql",
  sqlite3: "/usr/bin/sqlite3",
}));
get(`${P}/:host/connections`, (req) =>
  connections
    .all()
    .filter((c) => String(c.hostId) === req.params.host)
    .map(view),
);
function fromInput(body: unknown) {
  const b = (body ?? {}) as Partial<Connection> & {
    password?: string;
    clearPassword?: boolean;
  };
  return {
    name: b.name ?? "database",
    engine: b.engine ?? "postgres",
    address: b.address ?? "",
    port: b.port ?? null,
    username: b.username ?? "",
    database: b.database ?? "",
    runAs: b.runAs ?? "",
    readOnly: !!b.readOnly,
    password: b.password ?? "",
    clearPassword: !!b.clearPassword,
  };
}
post(`${P}/:host/connections/test`, async (req) => {
  await wait(600);
  const { engine } = fromInput(req.body);
  return {
    version:
      engine === "sqlite"
        ? "3.46.1"
        : engine === "mysql"
          ? "8.0.39"
          : "PostgreSQL 16.4 on x86_64-pc-linux-gnu",
  };
});
post(`${P}/:host/connections`, (req) => {
  const { password, clearPassword: _c, ...rest } = fromInput(req.body);
  return view(
    connections.insert({
      id: connections.nextId(),
      hostId: Number(req.params.host),
      ...rest,
      hasPassword: !!password,
    }),
  );
});
put(`${P}/:host/connections/:conn`, (req) => {
  const current = connection(req);
  const { password, clearPassword, ...rest } = fromInput(req.body);
  return view(
    connections.patch(current.id, {
      ...rest,
      hasPassword: clearPassword ? false : !!password || current.hasPassword,
    })!,
  );
});
del(`${P}/:host/connections/:conn`, (req) => {
  connections.remove(connection(req).id);
  return { ok: true };
});

const base = `${P}/:host/connections/:conn`;
get(`${base}/databases`, (req) => {
  connection(req);
  return ["app", "app_test", "postgres"];
});
get(`${base}/tables`, (req) => {
  connection(req);
  if (req.query.db && req.query.db !== "app") return [];
  return Object.values(data.get()).map((t) => ({
    schema: "public",
    name: t.name,
    kind: t.kind,
    rows: t.kind === "view" ? null : t.rows.length,
  }));
});
get(`${base}/describe`, (req) => {
  connection(req);
  const t = table(req.query.table);
  return { columns: t.columns, indexes: t.indexes };
});
post(`${base}/rows`, async (req) => {
  connection(req);
  await wait(250);
  const body = (req.body ?? {}) as {
    table: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    dir?: string;
    where?: string;
  };
  const t = table(body.table);
  const filtered = rowsOf(t).filter(matcher(t.columns, body.where ?? ""));
  const ordered = sorted(
    t.columns,
    filtered,
    body.orderBy ?? "",
    body.dir ?? "asc",
  );
  const offset = body.offset ?? 0;
  return {
    columns: t.columns,
    grid: {
      columns: t.columns.map((c) => c.name),
      rows: ordered.slice(offset, offset + (body.limit ?? 50)),
    },
    total: filtered.length,
  };
});

function writable(req: { params: Record<string, string> }, name: string) {
  const conn = connection(req);
  if (conn.readOnly) {
    throw new HttpError(403, { error: "This login is read only" });
  }
  const t = table(name);
  if (t.kind === "view") {
    throw new HttpError(400, { error: "Views can not be edited" });
  }
  return t;
}

function keyIndex(t: Table) {
  return t.columns.findIndex((c) => c.primary);
}

function save(t: Table) {
  data.update((all) => ({ ...all, [t.name]: t }));
}

post(`${base}/row`, (req) => {
  const body = req.body as { table: string; values: Record<string, Cell> };
  const t = writable(req, body.table);
  const k = keyIndex(t);
  const next =
    t.rows.reduce((max, r) => Math.max(max, Number(r[k]) || 0), 0) + 1;
  const row = t.columns.map((c, i) =>
    i === k ? String(next) : (body.values[c.name] ?? null),
  );
  save({ ...t, rows: [...t.rows, row] });
  return { affected: 1 };
});
put(`${base}/row`, (req) => {
  const body = req.body as {
    table: string;
    key: Record<string, Cell>;
    values: Record<string, Cell>;
  };
  const t = writable(req, body.table);
  const k = keyIndex(t);
  const id = body.key[t.columns[k].name];
  let affected = 0;
  const rows = t.rows.map((r) => {
    if (r[k] !== id) return r;
    affected++;
    return t.columns.map((c, i) =>
      c.name in body.values ? body.values[c.name] : r[i],
    );
  });
  save({ ...t, rows });
  return { affected };
});
post(`${base}/row/delete`, (req) => {
  const body = req.body as { table: string; key: Record<string, Cell> };
  const t = writable(req, body.table);
  const k = keyIndex(t);
  const id = body.key[t.columns[k].name];
  const rows = t.rows.filter((r) => r[k] !== id);
  save({ ...t, rows });
  return { affected: t.rows.length - rows.length };
});

post(`${base}/query`, async (req) => {
  const conn = connection(req);
  const { sql = "" } = (req.body ?? {}) as { sql?: string };
  const started = performance.now();
  await wait(180);
  const text = sql.trim().replace(/;\s*$/, "");
  const select =
    /^select\s+(.+?)\s+from\s+"?(\w+)"?(?:\s+where\s+(.+?))?(?:\s+order\s+by\s+"?(\w+)"?(?:\s+(asc|desc))?)?(?:\s+limit\s+(\d+))?$/is.exec(
      text,
    );
  const elapsed = () => Math.round(performance.now() - started);
  if (select) {
    const t = table(select[2]);
    const rows = sorted(
      t.columns,
      rowsOf(t).filter(matcher(t.columns, select[3] ?? "")),
      select[4] ?? "",
      (select[5] ?? "asc").toLowerCase(),
    ).slice(0, select[6] ? Number(select[6]) : 1000);
    const list = select[1].trim();
    if (/^count\(\*\)$/i.test(list)) {
      return {
        columns: ["count"],
        rows: [[String(rows.length)]],
        elapsedMs: elapsed(),
        readOnly: conn.readOnly,
      };
    }
    const names =
      list === "*"
        ? t.columns.map((c) => c.name)
        : list.split(",").map((s) => s.trim().replace(/"/g, ""));
    const indexes = names.map((n) => {
      const i = t.columns.findIndex((c) => c.name === n);
      if (i < 0) {
        throw new HttpError(400, {
          error: `ERROR:  column "${n}" does not exist`,
        });
      }
      return i;
    });
    return {
      columns: names,
      rows: rows.map((r) => indexes.map((i) => r[i])),
      elapsedMs: elapsed(),
      readOnly: conn.readOnly,
    };
  }
  if (/^(insert|update|delete|create|drop|alter|truncate)\b/i.test(text)) {
    if (conn.readOnly) {
      const verb = text.split(/\s+/)[0].toUpperCase();
      throw new HttpError(400, {
        error: `ERROR:  cannot execute ${verb} in a read-only transaction`,
      });
    }
    return { columns: [], rows: [], elapsedMs: elapsed(), readOnly: false };
  }
  if (/^select\s+version\(\)$/i.test(text)) {
    return {
      columns: ["version"],
      rows: [["PostgreSQL 16.4 on x86_64-pc-linux-gnu"]],
      elapsedMs: elapsed(),
      readOnly: conn.readOnly,
    };
  }
  throw new HttpError(400, {
    error: `ERROR:  syntax error at or near "${text.split(/\s+/)[0] ?? ""}"`,
  });
});
