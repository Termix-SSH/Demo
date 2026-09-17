/**
 * Stands in for the central axios client. There is no backend here, so this
 * re-exports the in-memory stubs under the module path the UI already imports.
 */
export * from "@/demo/demo-api";

import type { Host } from "@/types/ui-types";

/** The list-response shape the host sidebar expects. */
export type SSHHostWithStatus = Host;
