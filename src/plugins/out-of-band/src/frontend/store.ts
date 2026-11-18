import type { Device } from "../shared/types";
import { sharedApi } from "./api";

const REFRESH_MS = 60_000;

let devices: Device[] = [];
let loadedAt = 0;

/** A list older than REFRESH_MS is fetched again, with no timer running. */
export function deviceForHost(hostId: number): Device | undefined {
  if (Date.now() - loadedAt > REFRESH_MS) void reloadKnown();
  return devices.find((device) => device.hostId === hostId);
}

export function remember(list: Device[]): void {
  devices = list;
  loadedAt = Date.now();
}

export async function reloadKnown(): Promise<void> {
  loadedAt = Date.now();
  try {
    const list = await sharedApi()?.devices();
    if (list) devices = list;
  } catch {
    // The user may not be allowed to see the list
  }
}

/** Test seam. */
export function resetStore(): void {
  devices = [];
  loadedAt = 0;
}
