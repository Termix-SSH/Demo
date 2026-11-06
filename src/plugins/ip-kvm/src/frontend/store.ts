import type { Device } from "../shared/types";
import { sharedApi } from "./api";

const REFRESH_MS = 60_000;

let devices: Device[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function deviceForHost(hostId: number): Device | undefined {
  return devices.find((device) => device.hostId === hostId);
}

export function remember(list: Device[]): void {
  devices = list;
}

export async function reloadKnown(): Promise<void> {
  try {
    const list = await sharedApi()?.devices();
    if (list) devices = list;
  } catch {
    // The user may not be allowed to see the list
  }
}

export function startWatching(): void {
  void reloadKnown();
  if (!timer) timer = setInterval(() => void reloadKnown(), REFRESH_MS);
}

export function stopWatching(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
