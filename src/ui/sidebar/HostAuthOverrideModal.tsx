import type { Host } from "@/types/ui-types";
import type { AuthOverrideProtocol } from "@/types/auth-protocols";

export function HostAuthOverrideModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: Host;
  protocol: AuthOverrideProtocol;
}) {
  if (open) onOpenChange(false);
  return null;
}
