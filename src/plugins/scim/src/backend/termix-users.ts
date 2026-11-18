import type {
  PluginContext,
  PluginManagedUser,
  PluginRoleSummary,
  PluginUserAccounts,
} from "@termix-ssh/plugin-sdk/backend";

export type TermixUser = PluginManagedUser;
export type TermixRole = PluginRoleSummary;
export type UsersApi = PluginUserAccounts;

/** Error codes core puts on a failed ctx.users call. */
export type UsersErrorCode =
  "username_taken" | "email_taken" | "last_admin" | "not_found" | "invalid";

export function usersErrorCode(error: unknown): UsersErrorCode | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? (code as UsersErrorCode) : null;
}

/** The account calls, or null on a Termix too old to have them. */
export function usersApi(ctx: PluginContext): UsersApi | null {
  const users = ctx.users;
  return typeof users?.create === "function" ? (users as UsersApi) : null;
}
