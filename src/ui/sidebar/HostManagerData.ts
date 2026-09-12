import type { Host } from "@/types/ui-types";
import type { SSHHostWithStatus } from "@/main-axios";

/**
 * In the real app this converts the API host row (numeric ids, flattened
 * columns) into the UI Host shape. The demo fixtures are already written in the
 * UI shape, so this only needs to fill the derived fields the tree reads.
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
