import {
  useSettings,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { SecurityPanel } from "./SecurityPanel";

/** Starting state of the panel, from the user's settings. */
export function useSecurityCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 380,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** The host's views beside its terminal. */
export function SecurityCompanion({ host, isVisible }: CompanionProps) {
  if (!host) return null;
  return <SecurityPanel hostId={Number(host.id)} isVisible={isVisible} />;
}
