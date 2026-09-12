/**
 * The real app's central axios client. The demo has no backend, so this simply
 * re-exports the in-memory stubs under the same module path that copied files
 * already import.
 */
export * from "@/demo/demo-api";

import type { Host } from "@/types/ui-types";

/** Matches the real app's list-response shape used by the host sidebar. */
export type SSHHostWithStatus = Host;
