import type { DriverId } from "../../shared/types.js";
import type { Driver } from "./types.js";
import { snmpDriver } from "./snmp.js";
import { routerosDriver } from "./routeros.js";
import { opnsenseDriver } from "./opnsense.js";
import { openwrtDriver } from "./openwrt.js";
import { unifiDriver } from "./unifi.js";
import { pfsenseDriver } from "./pfsense.js";
import { ciscoDriver } from "./cisco.js";

export const drivers: Record<DriverId, Driver> = {
  snmp: snmpDriver,
  routeros: routerosDriver,
  opnsense: opnsenseDriver,
  openwrt: openwrtDriver,
  unifi: unifiDriver,
  pfsense: pfsenseDriver,
  cisco: ciscoDriver,
};

export function getDriver(id: string): Driver | undefined {
  return Object.prototype.hasOwnProperty.call(drivers, id)
    ? drivers[id as DriverId]
    : undefined;
}

export { DriverError } from "./types.js";
export type { Credentials, Driver, DriverIo, Target } from "./types.js";
