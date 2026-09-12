import type { Host } from "@/types/ui-types";

export function ProxmoxDiscoverDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  hosts?: Host[];
  onHostsChanged?: (hosts: Host[]) => void;
  preselectedHostId?: number;
  defaultCredentialId?: number | null;
  defaultAuthType?: string;
  defaultUsername?: string;
}) {
  if (open) onClose();
  return null;
}
