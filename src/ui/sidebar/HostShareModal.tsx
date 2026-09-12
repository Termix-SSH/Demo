import type { Host } from "@/types/ui-types";

export function HostShareModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  host: Host | null;
  /** Set instead of `host` when sharing a whole folder. */
  folder?: string | null;
}) {
  if (open) onClose();
  return null;
}
