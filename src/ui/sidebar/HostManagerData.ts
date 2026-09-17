import type { Host } from "@/types/ui-types";
import type { SSHHostWithStatus } from "@/main-axios";

/**
 * Converts a host row into the UI Host shape. The fixtures are already written
 * in that shape, so this only fills the derived fields the tree reads.
 */
export function sshHostToHost(h: SSHHostWithStatus): Host {
  return {
    ...h,
    id: String(h.id),
    folder: h.folder ?? "",
    parentHostId: h.parentHostId != null ? String(h.parentHostId) : null,
    online: h.status === "online",
    tags: h.tags ?? [],
    pin: h.pin ?? false,
    sortOrder: h.sortOrder ?? null,
  };
}
