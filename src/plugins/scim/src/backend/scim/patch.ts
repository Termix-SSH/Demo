/**
 * SCIM PATCH (RFC 7644 3.5.2) on a resource held as plain JSON. Accepts the
 * shapes Entra ID and Okta send: ops in any case, a path-less replace whose
 * keys are paths ("name.givenName", "urn:...:department"), and filtered
 * paths like members[value eq "id"] or emails[type eq "work"].value.
 */

import { ScimError } from "./errors.js";
import { matches, parseFilter, type Filter } from "./filter.js";

export const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const CORE_URN = /^urn:ietf:params:scim:schemas:core:2\.0:(user|group)$/i;
const MAX_OPERATIONS = 1000;

type Json = Record<string, unknown>;

interface ParsedPath {
  /** Extension schema URN the attribute lives under, or null for core. */
  urn: string | null;
  attr: string;
  filter: Filter | null;
  sub: string | null;
}

function badPath(path: string): ScimError {
  return new ScimError(400, `Bad path "${path}"`, "invalidPath");
}

function isObject(value: unknown): value is Json {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parsePath(path: string): ParsedPath {
  const trimmed = path.trim();
  const bracket = trimmed.indexOf("[");
  const head = bracket === -1 ? trimmed : trimmed.slice(0, bracket);
  let filter: Filter | null = null;
  let tail = "";
  if (bracket !== -1) {
    const close = trimmed.lastIndexOf("]");
    if (close < bracket) throw badPath(path);
    filter = parseFilter(trimmed.slice(bracket + 1, close));
    tail = trimmed.slice(close + 1);
    if (tail && !tail.startsWith(".")) throw badPath(path);
    tail = tail.slice(1);
  }

  let urn: string | null = null;
  let name = head;
  if (/^urn:/i.test(head)) {
    const lastColon = head.lastIndexOf(":");
    urn = head.slice(0, lastColon);
    name = head.slice(lastColon + 1);
    if (CORE_URN.test(urn)) urn = null;
  }
  const [attr, sub] = name.split(".", 2);
  if (!attr || !/^[A-Za-z$][\w$-]*$/.test(attr)) throw badPath(path);
  const subAttr = tail || sub || null;
  if (subAttr && !/^[A-Za-z$][\w$-]*$/.test(subAttr)) throw badPath(path);
  return { urn, attr, filter, sub: subAttr };
}

function findKey(target: Json, name: string): string {
  const lower = name.toLowerCase();
  return Object.keys(target).find((key) => key.toLowerCase() === lower) ?? name;
}

function containerFor(
  resource: Json,
  urn: string | null,
  create: boolean,
): Json | null {
  if (!urn) return resource;
  const key = findKey(resource, urn);
  const existing = resource[key];
  if (isObject(existing)) return existing;
  if (!create) return null;
  const made: Json = {};
  resource[key] = made;
  return made;
}

function sameItem(a: unknown, b: unknown): boolean {
  if (isObject(a) && isObject(b) && "value" in a && "value" in b) {
    return String(a.value) === String(b.value);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function merge(target: Json, value: Json): void {
  for (const [key, next] of Object.entries(value)) {
    const own = findKey(target, key);
    target[own] = next;
  }
}

/** A new element for a filter like type eq "work", when nothing matched. */
function seedFromFilter(filter: Filter): Json | null {
  if (filter.kind === "compare" && filter.op === "eq" && !filter.path.sub) {
    return { [filter.path.attr]: filter.value };
  }
  return null;
}

function applyFiltered(
  container: Json,
  op: string,
  parsed: ParsedPath,
  value: unknown,
): void {
  const key = findKey(container, parsed.attr);
  const list = Array.isArray(container[key])
    ? (container[key] as unknown[])
    : [];
  const hits = list.filter((item) => matches(parsed.filter!, item));

  if (op === "remove") {
    if (parsed.sub) {
      for (const item of hits) {
        if (isObject(item)) delete item[findKey(item, parsed.sub)];
      }
    } else {
      container[key] = list.filter((item) => !hits.includes(item));
    }
    return;
  }

  if (hits.length === 0) {
    const seed = seedFromFilter(parsed.filter!);
    if (!seed)
      throw new ScimError(400, "No value matches the path", "noTarget");
    if (parsed.sub) seed[parsed.sub] = value;
    else if (isObject(value)) merge(seed, value);
    container[key] = [...list, seed];
    return;
  }
  for (const item of hits) {
    if (!isObject(item)) continue;
    if (parsed.sub) item[findKey(item, parsed.sub)] = value;
    else if (isObject(value)) merge(item, value);
  }
}

const SCHEMA_IDS = [
  "urn:ietf:params:scim:schemas:core:2.0:user",
  "urn:ietf:params:scim:schemas:core:2.0:group",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:user",
];

function applyPath(
  resource: Json,
  op: string,
  path: string,
  value: unknown,
): void {
  // A whole schema as the key, like the enterprise extension object.
  if (SCHEMA_IDS.includes(path.trim().toLowerCase())) {
    if (!isObject(value)) return;
    const urn = CORE_URN.test(path.trim()) ? null : path.trim();
    for (const [key, next] of Object.entries(value)) {
      applyPath(resource, op, urn ? `${urn}:${key}` : key, next);
    }
    return;
  }
  const parsed = parsePath(path);
  const container = containerFor(resource, parsed.urn, op !== "remove");
  if (!container) return;

  if (parsed.filter) {
    applyFiltered(container, op, parsed, value);
    return;
  }

  const key = findKey(container, parsed.attr);
  if (parsed.sub) {
    const current = container[key];
    if (op === "remove") {
      if (isObject(current)) delete current[findKey(current, parsed.sub)];
      return;
    }
    const target = isObject(current) ? current : {};
    target[findKey(target, parsed.sub)] = value;
    container[key] = target;
    return;
  }

  const current = container[key];
  if (op === "remove") {
    // Entra and Okta remove group members by listing them in value.
    if (Array.isArray(current) && Array.isArray(value)) {
      container[key] = current.filter(
        (item) => !value.some((gone) => sameItem(item, gone)),
      );
    } else {
      delete container[key];
    }
    return;
  }
  if (op === "add" && Array.isArray(current)) {
    const incoming = Array.isArray(value) ? value : [value];
    const next = [...current];
    for (const item of incoming) {
      if (!next.some((have) => sameItem(have, item))) next.push(item);
    }
    container[key] = next;
    return;
  }
  if (isObject(current) && isObject(value)) {
    merge(current, value);
    return;
  }
  container[key] = value;
}

export interface PatchOperation {
  op: string;
  path?: string;
  value?: unknown;
}

/** Reads and checks a PatchOp body. */
export function readPatchBody(body: unknown): PatchOperation[] {
  if (!isObject(body))
    throw new ScimError(400, "Body must be an object", "invalidSyntax");
  const operations = body.Operations ?? body.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new ScimError(400, "Operations is required", "invalidSyntax");
  }
  if (operations.length > MAX_OPERATIONS) {
    throw new ScimError(400, "Too many operations", "tooMany");
  }
  return operations.map((raw) => {
    if (!isObject(raw) || typeof raw.op !== "string") {
      throw new ScimError(400, "Each operation needs an op", "invalidSyntax");
    }
    const op = raw.op.toLowerCase();
    if (op !== "add" && op !== "replace" && op !== "remove") {
      throw new ScimError(400, `Unknown op "${raw.op}"`, "invalidSyntax");
    }
    if (raw.path !== undefined && typeof raw.path !== "string") {
      throw new ScimError(400, "path must be a string", "invalidPath");
    }
    return { op, path: raw.path as string | undefined, value: raw.value };
  });
}

/** Applies operations to a copy of the resource and returns the copy. */
export function applyPatch(resource: Json, operations: PatchOperation[]): Json {
  const copy = JSON.parse(JSON.stringify(resource)) as Json;
  for (const { op, path, value } of operations) {
    const lower = op.toLowerCase();
    if (path) {
      applyPath(copy, lower, path, value);
      continue;
    }
    if (lower === "remove")
      throw new ScimError(400, "remove needs a path", "noTarget");
    if (!isObject(value)) {
      throw new ScimError(
        400,
        "A patch without a path needs an object value",
        "invalidValue",
      );
    }
    for (const [key, next] of Object.entries(value)) {
      applyPath(copy, lower, key, next);
    }
  }
  return copy;
}
