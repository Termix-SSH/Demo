import type { Host } from "@/types/ui-types";

export function HostExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  hosts?: Host[];
  preselectedHostIds?: Set<string>;
}) {
  if (open) onClose();
  return null;
}
