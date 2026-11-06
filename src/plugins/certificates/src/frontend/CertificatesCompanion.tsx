import {
  useSettings,
  type CompanionDefaults,
  type CompanionProps,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { CertificatesTab } from "./CertificatesTab";

/** Starting state of the panel, from the user's settings. */
export function useCertificatesCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 380,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** The Certificates tab, beside a terminal. */
export function CertificatesCompanion({
  host,
  sshHost,
  tab,
  isVisible,
}: CompanionProps) {
  return (
    <CertificatesTab
      {...({ tab, host, sshHost, label: tab.label, isVisible } as TabProps)}
    />
  );
}
