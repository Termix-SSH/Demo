import type { Driver } from "./types.js";
import { amt } from "./amt.js";
import { ipmi } from "./ipmi.js";
import { redfish } from "./redfish.js";

export const drivers: Record<string, Driver> = { redfish, ipmi, amt };

export function getDriver(id: string): Driver | undefined {
  return drivers[id];
}

export * from "./types.js";
