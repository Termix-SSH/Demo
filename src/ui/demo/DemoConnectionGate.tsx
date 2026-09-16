import type React from "react";
import { ConnectionLogProvider } from "@/ssh/connection-log/ConnectionLogContext";
import { ConnectionScreen } from "@/components/connection/ConnectionScreen";
import {
  useDemoConnection,
  type DemoConnectionOptions,
} from "@/demo/use-demo-connection";

/**
 * Wraps a tab in its own connection log and holds the loading screen over it
 * until the scripted connect finishes. Each tab gets its own provider so one
 * tab's log never shows up in another.
 */
export function DemoConnectionGate({
  children,
  ...options
}: DemoConnectionOptions & { children: React.ReactNode }) {
  return (
    <ConnectionLogProvider>
      <Gate {...options}>{children}</Gate>
    </ConnectionLogProvider>
  );
}

function Gate({
  children,
  ...options
}: DemoConnectionOptions & { children: React.ReactNode }) {
  const { status, isConnecting, message, detail, retry } =
    useDemoConnection(options);

  return (
    <div className="relative h-full w-full bg-background">
      {!isConnecting && children}
      <ConnectionScreen
        status={status}
        message={message}
        detail={detail}
        onManualRetry={retry}
      />
    </div>
  );
}
