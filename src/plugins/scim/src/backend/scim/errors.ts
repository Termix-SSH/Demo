export const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export type ScimType =
  | "invalidFilter"
  | "invalidSyntax"
  | "invalidPath"
  | "invalidValue"
  | "noTarget"
  | "mutability"
  | "uniqueness"
  | "tooMany";

/** An error answered to the identity provider in SCIM's own shape. */
export class ScimError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly scimType?: ScimType,
  ) {
    super(detail);
  }

  toJSON() {
    return {
      schemas: [ERROR_SCHEMA],
      status: String(this.status),
      ...(this.scimType ? { scimType: this.scimType } : {}),
      detail: this.detail,
    };
  }
}
