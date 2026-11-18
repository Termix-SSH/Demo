/**
 * SCIM filters (RFC 7644 3.4.2.2): comparisons, and/or/not, grouping and
 * value paths like emails[type eq "work"].value. Matched in memory against a
 * resource as JSON.
 */

import { ScimError } from "./errors.js";

export type Filter =
  | { kind: "and" | "or"; left: Filter; right: Filter }
  | { kind: "not"; inner: Filter }
  | { kind: "compare"; path: AttrPath; op: CompareOp; value: unknown }
  | { kind: "present"; path: AttrPath }
  | { kind: "valuePath"; path: AttrPath; filter: Filter; sub: string | null };

export type CompareOp =
  "eq" | "ne" | "co" | "sw" | "ew" | "gt" | "ge" | "lt" | "le";

export interface AttrPath {
  /** Lower case attribute name, after any schema URN. */
  attr: string;
  /** Lower case sub attribute, like givenName in name.givenName. */
  sub: string | null;
}

type Token =
  | { type: "word"; value: string }
  | { type: "string"; value: string }
  | { type: "open" | "close" | "lbracket" | "rbracket" };

const MAX_FILTER_LENGTH = 2000;
const COMPARE_OPS = new Set([
  "eq",
  "ne",
  "co",
  "sw",
  "ew",
  "gt",
  "ge",
  "lt",
  "le",
]);
const URN_PREFIX = /^urn:[^\s]+:/i;

/** Attributes compared case sensitively; everything else ignores case. */
const CASE_EXACT = new Set(["id", "externalid"]);

function invalid(detail: string): ScimError {
  return new ScimError(400, detail, "invalidFilter");
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "open" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "close" });
      i++;
    } else if (ch === "[") {
      tokens.push({ type: "lbracket" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "rbracket" });
      i++;
    } else if (ch === '"') {
      let value = "";
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
        } else {
          value += input[i++];
        }
      }
      if (input[i] !== '"') throw invalid("Unclosed string in filter");
      i++;
      tokens.push({ type: "string", value });
    } else {
      let value = "";
      while (i < input.length && !/[\s()[\]"]/.test(input[i])) {
        value += input[i++];
      }
      tokens.push({ type: "word", value });
    }
  }
  return tokens;
}

/** Splits "urn:...:User:name.givenName" or "emails.value" into parts. */
export function parseAttrPath(raw: string): AttrPath {
  // With a schema URN the attribute follows the last colon.
  const name = URN_PREFIX.test(raw) ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  const [attr, sub] = name.split(".", 2);
  if (!attr || !/^[A-Za-z$][\w$-]*$/.test(attr)) {
    throw invalid(`Bad attribute "${raw}"`);
  }
  return { attr: attr.toLowerCase(), sub: sub ? sub.toLowerCase() : null };
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Filter {
    const filter = this.parseOr();
    if (this.pos < this.tokens.length)
      throw invalid("Unexpected text in filter");
    return filter;
  }

  private peekWord(): string | null {
    const token = this.tokens[this.pos];
    return token?.type === "word" ? token.value.toLowerCase() : null;
  }

  private parseOr(): Filter {
    let left = this.parseAnd();
    while (this.peekWord() === "or") {
      this.pos++;
      left = { kind: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Filter {
    let left = this.parseUnary();
    while (this.peekWord() === "and") {
      this.pos++;
      left = { kind: "and", left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Filter {
    if (this.peekWord() === "not") {
      this.pos++;
      const token = this.tokens[this.pos];
      if (token?.type !== "open") throw invalid("not needs parentheses");
      return { kind: "not", inner: this.parseUnary() };
    }
    const token = this.tokens[this.pos];
    if (token?.type === "open") {
      this.pos++;
      const inner = this.parseOr();
      if (this.tokens[this.pos]?.type !== "close") throw invalid("Missing )");
      this.pos++;
      return inner;
    }
    return this.parseAttr();
  }

  private parseAttr(): Filter {
    const token = this.tokens[this.pos++];
    if (token?.type !== "word") throw invalid("Expected an attribute");
    const path = parseAttrPath(token.value);

    if (this.tokens[this.pos]?.type === "lbracket") {
      this.pos++;
      const filter = this.parseOr();
      if (this.tokens[this.pos]?.type !== "rbracket")
        throw invalid("Missing ]");
      this.pos++;
      // emails[type eq "work"].value eq "x": the sub attribute follows "]".
      const next = this.tokens[this.pos];
      let sub: string | null = null;
      if (next?.type === "word" && next.value.startsWith(".")) {
        sub = next.value.slice(1).toLowerCase();
        this.pos++;
      }
      const valuePath: Filter = { kind: "valuePath", path, filter, sub };
      if (sub === null) return valuePath;
      return this.parseComparison({ attr: path.attr, sub }, valuePath);
    }
    return this.parseComparison(path, null);
  }

  private parseComparison(path: AttrPath, scope: Filter | null): Filter {
    const op = this.peekWord();
    if (!op) throw invalid("Expected an operator");
    this.pos++;
    let compare: Filter;
    if (op === "pr") {
      compare = { kind: "present", path };
    } else if (COMPARE_OPS.has(op)) {
      compare = {
        kind: "compare",
        path,
        op: op as CompareOp,
        value: this.parseValue(),
      };
    } else {
      throw invalid(`Unknown operator "${op}"`);
    }
    if (!scope || scope.kind !== "valuePath") return compare;
    // emails[type eq "work"].value eq "x" matches one element on both parts.
    return {
      kind: "valuePath",
      path: { attr: path.attr, sub: null },
      filter: {
        kind: "and",
        left: scope.filter,
        right: {
          ...compare,
          path: { attr: path.sub ?? "value", sub: null },
        } as Filter,
      },
      sub: null,
    };
  }

  private parseValue(): unknown {
    const token = this.tokens[this.pos++];
    if (!token) throw invalid("Expected a value");
    if (token.type === "string") return token.value;
    if (token.type !== "word") throw invalid("Expected a value");
    const lower = token.value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    if (lower === "null") return null;
    const number = Number(token.value);
    if (!Number.isNaN(number)) return number;
    throw invalid(`Bad value "${token.value}"`);
  }
}

export function parseFilter(input: string): Filter {
  if (input.length > MAX_FILTER_LENGTH) throw invalid("Filter is too long");
  return new Parser(tokenize(input)).parse();
}

/** The value at a key, matching the key without regard to case. */
export function getAttr(resource: unknown, name: string): unknown {
  if (!resource || typeof resource !== "object") return undefined;
  const attr = name.toLowerCase();
  for (const [key, value] of Object.entries(resource)) {
    if (key.toLowerCase() === attr) return value;
  }
  // Enterprise extension attributes live under their schema URN.
  for (const [key, value] of Object.entries(resource)) {
    if (
      key.toLowerCase().startsWith("urn:") &&
      value &&
      typeof value === "object"
    ) {
      const found = getAttr(value, attr);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function valuesAt(resource: unknown, path: AttrPath): unknown[] {
  const top = getAttr(resource, path.attr);
  const list = Array.isArray(top) ? top : top === undefined ? [] : [top];
  if (!path.sub) {
    if (!Array.isArray(top)) return list;
    // A multi-valued attribute compares on its primary value.
    return list.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? getAttr(item, "value")
        : item,
    );
  }
  return list.map((item) => getAttr(item, path.sub!));
}

function compareOne(
  actual: unknown,
  op: CompareOp,
  expected: unknown,
  exact: boolean,
): boolean {
  if (actual === undefined || actual === null)
    return op === "ne" && expected !== null;
  if (typeof actual === "boolean" || typeof expected === "boolean") {
    const a = String(actual).toLowerCase();
    const e = String(expected).toLowerCase();
    if (op === "eq") return a === e;
    if (op === "ne") return a !== e;
    return false;
  }
  if (typeof actual === "number" && typeof expected === "number") {
    switch (op) {
      case "eq":
        return actual === expected;
      case "ne":
        return actual !== expected;
      case "gt":
        return actual > expected;
      case "ge":
        return actual >= expected;
      case "lt":
        return actual < expected;
      case "le":
        return actual <= expected;
      default:
        return false;
    }
  }
  let a = String(actual);
  let e = String(expected ?? "");
  if (!exact) {
    a = a.toLowerCase();
    e = e.toLowerCase();
  }
  switch (op) {
    case "eq":
      return a === e;
    case "ne":
      return a !== e;
    case "co":
      return a.includes(e);
    case "sw":
      return a.startsWith(e);
    case "ew":
      return a.endsWith(e);
    case "gt":
      return a > e;
    case "ge":
      return a >= e;
    case "lt":
      return a < e;
    case "le":
      return a <= e;
  }
}

export function matches(filter: Filter, resource: unknown): boolean {
  switch (filter.kind) {
    case "and":
      return matches(filter.left, resource) && matches(filter.right, resource);
    case "or":
      return matches(filter.left, resource) || matches(filter.right, resource);
    case "not":
      return !matches(filter.inner, resource);
    case "present":
      return valuesAt(resource, filter.path).some(
        (value) => value !== undefined && value !== null && value !== "",
      );
    case "compare": {
      const values = valuesAt(resource, filter.path);
      const exact = CASE_EXACT.has(filter.path.sub ?? filter.path.attr);
      if (filter.op === "ne") {
        return values.every((value) =>
          compareOne(value, "ne", filter.value, exact),
        );
      }
      return values.some((value) =>
        compareOne(value, filter.op, filter.value, exact),
      );
    }
    case "valuePath": {
      const list = getAttr(resource, filter.path.attr);
      if (!Array.isArray(list)) return false;
      return list.some((item) => matches(filter.filter, item));
    }
  }
}

/** The one value a simple `attr eq "x"` filter asks for, for a fast lookup. */
export function simpleEquals(filter: Filter, attr: string): string | null {
  if (
    filter.kind === "compare" &&
    filter.op === "eq" &&
    filter.path.attr === attr &&
    !filter.path.sub &&
    typeof filter.value === "string"
  ) {
    return filter.value;
  }
  return null;
}
