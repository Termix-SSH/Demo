import * as sdkUi from "@termix-ssh/plugin-sdk/ui";

// Account, invite and access review calls added in Termix 26.11.2. Read off
// the SDK at runtime so the layout still loads on a core without them; each
// screen hides what its core can't do.

export type UserStatusFilter = "active" | "disabled" | "pending";

export interface UserProfileUpdate {
  displayName?: string | null;
  email?: string | null;
}

export interface UserInvite {
  id: string;
  note: string | null;
  roleIds: number[];
  makeAdmin: boolean;
  maxUses: number;
  uses: number;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  state: "active" | "revoked" | "expired" | "used";
}

export interface NewUserInvite {
  note?: string;
  roleIds?: number[];
  makeAdmin?: boolean;
  maxUses?: number;
  expiresInHours?: number;
}

export type AccessKind = "host" | "folder" | "credential";

export interface AccessReviewRow {
  kind: AccessKind;
  accessId: number;
  targetId: string;
  targetName: string;
  ownerId: string | null;
  ownerUsername: string | null;
  granteeUserId: string | null;
  granteeUsername: string | null;
  granteeRoleId: number | null;
  granteeRoleName: string | null;
  permissionLevel: string;
  grantedBy: string | null;
  grantedByUsername: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastAccessedAt: string | null;
}

export interface AccessReviewFilter {
  kind?: AccessKind;
  userId?: string;
  roleId?: number;
  limit?: number;
  offset?: number;
}

export interface UserAdminApi {
  disableUser(userId: string): Promise<{ disabled: boolean }>;
  enableUser(userId: string): Promise<{ disabled: boolean }>;
  updateMyProfile(update: UserProfileUpdate): Promise<unknown>;
  adminUpdateUserProfile(
    userId: string,
    update: UserProfileUpdate,
  ): Promise<unknown>;
  getAdminHostBypass(): Promise<{ enabled: boolean }>;
  updateAdminHostBypass(enabled: boolean): Promise<unknown>;
  getExternalSignupApproval(): Promise<{ enabled: boolean }>;
  updateExternalSignupApproval(enabled: boolean): Promise<unknown>;
  listUserInvites(): Promise<UserInvite[]>;
  createUserInvite(
    input: NewUserInvite,
  ): Promise<{ id: string; token: string; expiresAt: string }>;
  revokeUserInvite(id: string): Promise<void>;
  inviteLink(token: string): string;
  getAccessReview(
    filter?: AccessReviewFilter,
  ): Promise<{ shares: AccessReviewRow[]; total: number }>;
  downloadAccessReviewCsv(filter?: AccessReviewFilter): Promise<Blob>;
}

export const userAdminApi = sdkUi as unknown as Partial<UserAdminApi>;

/** True when the running core has every call in the list. */
export function hasUserAdminApi(...names: (keyof UserAdminApi)[]): boolean {
  try {
    return names.every((name) => typeof userAdminApi[name] === "function");
  } catch {
    // A strict module mock throws on a name it does not have.
    return false;
  }
}

/** The API, once hasUserAdminApi said the calls are there. */
export function requireUserAdminApi(): UserAdminApi {
  return userAdminApi as UserAdminApi;
}
