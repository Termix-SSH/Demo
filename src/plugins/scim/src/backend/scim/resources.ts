import { ScimError } from "./errors.js";
import { getAttr } from "./filter.js";

export const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const ENTERPRISE_SCHEMA =
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
export const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SP_CONFIG_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const RESOURCE_TYPE_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:ResourceType";
const SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";

export const MAX_PAGE = 200;
const MAX_NAME_LENGTH = 255;
/** Termix keeps display names this long at most. */
const MAX_DISPLAY_NAME = 64;
const MAX_EMAIL = 254;

type Json = Record<string, unknown>;

/** Attributes the server owns or never keeps. */
const SERVER_OWNED = new Set(["id", "meta", "schemas", "groups", "password"]);

function isObject(value: unknown): value is Json {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** "True", "false", true: Entra sends active as a string. */
export function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

/** The attributes a client sent, without what the server owns. */
export function clientAttributes(body: unknown): Json {
  if (!isObject(body)) {
    throw new ScimError(400, "Body must be an object", "invalidSyntax");
  }
  const out: Json = {};
  for (const [key, value] of Object.entries(body)) {
    if (!SERVER_OWNED.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

export interface UserProfile {
  userName: string;
  externalId: string | null;
  active: boolean;
  displayName: string | null;
  email: string | null;
}

function primaryEmail(attributes: Json): string | null {
  const emails = getAttr(attributes, "emails");
  if (!Array.isArray(emails)) return null;
  const items = emails.filter(isObject);
  const pick =
    items.find((item) => toBoolean(getAttr(item, "primary"), false)) ??
    items.find(
      (item) => text(getAttr(item, "type")).toLowerCase() === "work",
    ) ??
    items[0];
  const value = pick ? text(getAttr(pick, "value")).toLowerCase() : "";
  return value.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? value
    : null;
}

function displayNameOf(attributes: Json): string | null {
  const direct = text(getAttr(attributes, "displayName"));
  if (direct) return direct.slice(0, MAX_DISPLAY_NAME);
  const name = getAttr(attributes, "name");
  if (isObject(name)) {
    const formatted = text(getAttr(name, "formatted"));
    if (formatted) return formatted.slice(0, MAX_DISPLAY_NAME);
    const joined = [
      text(getAttr(name, "givenName")),
      text(getAttr(name, "familyName")),
    ]
      .filter(Boolean)
      .join(" ");
    if (joined) return joined.slice(0, MAX_DISPLAY_NAME);
  }
  return null;
}

/** What Termix keeps from a SCIM user. */
export function userProfile(attributes: Json): UserProfile {
  const userName = text(getAttr(attributes, "userName"));
  if (!userName)
    throw new ScimError(400, "userName is required", "invalidValue");
  if (userName.length > MAX_NAME_LENGTH) {
    throw new ScimError(400, "userName is too long", "invalidValue");
  }
  const externalId = text(getAttr(attributes, "externalId"));
  return {
    userName,
    externalId: externalId ? externalId.slice(0, MAX_NAME_LENGTH) : null,
    active: toBoolean(getAttr(attributes, "active"), true),
    displayName: displayNameOf(attributes),
    email: primaryEmail(attributes),
  };
}

export interface GroupProfile {
  displayName: string;
  externalId: string | null;
  /** SCIM ids of the members, or null when the body named none. */
  members: string[] | null;
}

export function groupProfile(attributes: Json): GroupProfile {
  const displayName = text(getAttr(attributes, "displayName"));
  if (!displayName)
    throw new ScimError(400, "displayName is required", "invalidValue");
  const externalId = text(getAttr(attributes, "externalId"));
  const rawMembers = getAttr(attributes, "members");
  return {
    displayName: displayName.slice(0, MAX_NAME_LENGTH),
    externalId: externalId ? externalId.slice(0, MAX_NAME_LENGTH) : null,
    members: Array.isArray(rawMembers)
      ? rawMembers
          .map((member) =>
            isObject(member) ? text(getAttr(member, "value")) : "",
          )
          .filter(Boolean)
      : null,
  };
}

export interface Meta {
  resourceType: "User" | "Group";
  created: string;
  lastModified: string;
  location: string;
  version: number;
}

function metaJson(meta: Meta) {
  return {
    resourceType: meta.resourceType,
    created: meta.created,
    lastModified: meta.lastModified,
    location: meta.location,
    version: `W/"${meta.version}"`,
  };
}

export function userResource(input: {
  id: string;
  attributes: Json;
  active: boolean;
  groups: Array<{ id: string; display: string; location: string }>;
  meta: Meta;
}): Json {
  const schemas = [USER_SCHEMA];
  if (
    Object.keys(input.attributes).some(
      (key) => key.toLowerCase() === ENTERPRISE_SCHEMA.toLowerCase(),
    )
  ) {
    schemas.push(ENTERPRISE_SCHEMA);
  }
  return {
    schemas,
    ...input.attributes,
    id: input.id,
    active: input.active,
    groups: input.groups.map((group) => ({
      value: group.id,
      display: group.display,
      $ref: group.location,
      type: "direct",
    })),
    meta: metaJson(input.meta),
  };
}

export function groupResource(input: {
  id: string;
  displayName: string;
  externalId: string | null;
  members: Array<{ id: string; display: string; location: string }>;
  meta: Meta;
}): Json {
  return {
    schemas: [GROUP_SCHEMA],
    id: input.id,
    ...(input.externalId ? { externalId: input.externalId } : {}),
    displayName: input.displayName,
    members: input.members.map((member) => ({
      value: member.id,
      display: member.display,
      $ref: member.location,
      type: "User",
    })),
    meta: metaJson(input.meta),
  };
}

/** Applies the attributes and excludedAttributes query parameters. */
export function project(
  resource: Json,
  attributes?: string,
  excluded?: string,
): Json {
  const names = (raw?: string) =>
    (raw ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .map((name) =>
        name.startsWith("urn:") ? name.slice(name.lastIndexOf(":") + 1) : name,
      )
      .map((name) => name.split(".")[0])
      .filter(Boolean);
  const keep = names(attributes);
  const drop = new Set(names(excluded));
  const always = new Set(["id", "schemas", "meta"]);
  const out: Json = {};
  for (const [key, value] of Object.entries(resource)) {
    const lower = key.toLowerCase();
    if (always.has(lower)) {
      out[key] = value;
    } else if (keep.length > 0) {
      if (keep.includes(lower)) out[key] = value;
    } else if (!drop.has(lower)) {
      out[key] = value;
    }
  }
  return out;
}

export function listResponse(
  resources: Json[],
  total: number,
  startIndex: number,
): Json {
  return {
    schemas: [LIST_SCHEMA],
    totalResults: total,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

/** startIndex is 1-based; count is capped. */
export function readPaging(query: Record<string, unknown>): {
  startIndex: number;
  count: number;
} {
  const start = Number.parseInt(String(query.startIndex ?? "1"), 10);
  const count = Number.parseInt(String(query.count ?? String(MAX_PAGE)), 10);
  return {
    startIndex: Number.isFinite(start) && start > 0 ? start : 1,
    count:
      Number.isFinite(count) && count >= 0
        ? Math.min(count, MAX_PAGE)
        : MAX_PAGE,
  };
}

export function serviceProviderConfig(baseUrl: string, docsUrl: string): Json {
  return {
    schemas: [SP_CONFIG_SCHEMA],
    documentationUri: docsUrl,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: MAX_PAGE },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer token",
        description: "The token shown when the connection was made",
        primary: true,
      },
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: `${baseUrl}/ServiceProviderConfig`,
    },
  };
}

export function resourceTypes(baseUrl: string): Json[] {
  return [
    {
      schemas: [RESOURCE_TYPE_SCHEMA],
      id: "User",
      name: "User",
      endpoint: "/Users",
      schema: USER_SCHEMA,
      schemaExtensions: [{ schema: ENTERPRISE_SCHEMA, required: false }],
      meta: {
        resourceType: "ResourceType",
        location: `${baseUrl}/ResourceTypes/User`,
      },
    },
    {
      schemas: [RESOURCE_TYPE_SCHEMA],
      id: "Group",
      name: "Group",
      endpoint: "/Groups",
      schema: GROUP_SCHEMA,
      meta: {
        resourceType: "ResourceType",
        location: `${baseUrl}/ResourceTypes/Group`,
      },
    },
  ];
}

function attribute(
  name: string,
  extra: Partial<{
    type: string;
    multiValued: boolean;
    required: boolean;
    caseExact: boolean;
    mutability: string;
    returned: string;
    uniqueness: string;
    subAttributes: Json[];
  }> = {},
): Json {
  return {
    name,
    type: extra.type ?? "string",
    multiValued: extra.multiValued ?? false,
    required: extra.required ?? false,
    caseExact: extra.caseExact ?? false,
    mutability: extra.mutability ?? "readWrite",
    returned: extra.returned ?? "default",
    uniqueness: extra.uniqueness ?? "none",
    ...(extra.subAttributes ? { subAttributes: extra.subAttributes } : {}),
  };
}

const multiValue = (extra: Json[] = []) => [
  attribute("value"),
  attribute("display"),
  attribute("type"),
  attribute("primary", { type: "boolean" }),
  ...extra,
];

export function schemas(baseUrl: string): Json[] {
  const location = (id: string) => ({
    resourceType: "Schema",
    location: `${baseUrl}/Schemas/${id}`,
  });
  return [
    {
      schemas: [SCHEMA_SCHEMA],
      id: USER_SCHEMA,
      name: "User",
      attributes: [
        attribute("userName", { required: true, uniqueness: "server" }),
        attribute("name", {
          type: "complex",
          subAttributes: [
            attribute("formatted"),
            attribute("familyName"),
            attribute("givenName"),
            attribute("middleName"),
          ],
        }),
        attribute("displayName"),
        attribute("nickName"),
        attribute("title"),
        attribute("userType"),
        attribute("preferredLanguage"),
        attribute("locale"),
        attribute("timezone"),
        attribute("active", { type: "boolean" }),
        attribute("emails", {
          type: "complex",
          multiValued: true,
          subAttributes: multiValue(),
        }),
        attribute("phoneNumbers", {
          type: "complex",
          multiValued: true,
          subAttributes: multiValue(),
        }),
        attribute("groups", {
          type: "complex",
          multiValued: true,
          mutability: "readOnly",
          subAttributes: multiValue(),
        }),
      ],
      meta: location(USER_SCHEMA),
    },
    {
      schemas: [SCHEMA_SCHEMA],
      id: ENTERPRISE_SCHEMA,
      name: "EnterpriseUser",
      attributes: [
        attribute("employeeNumber"),
        attribute("costCenter"),
        attribute("organization"),
        attribute("division"),
        attribute("department"),
        attribute("manager", {
          type: "complex",
          subAttributes: [attribute("value"), attribute("displayName")],
        }),
      ],
      meta: location(ENTERPRISE_SCHEMA),
    },
    {
      schemas: [SCHEMA_SCHEMA],
      id: GROUP_SCHEMA,
      name: "Group",
      attributes: [
        attribute("displayName", { required: true }),
        attribute("members", {
          type: "complex",
          multiValued: true,
          subAttributes: [
            attribute("value"),
            attribute("display"),
            attribute("type"),
          ],
        }),
      ],
      meta: location(GROUP_SCHEMA),
    },
  ];
}
