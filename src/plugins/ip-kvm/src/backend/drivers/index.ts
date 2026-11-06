import type { Driver } from "./types.js";
import { jetkvm } from "./jetkvm.js";
import { nanokvm } from "./nanokvm.js";
import { glkvm, pikvm } from "./pikvm.js";

export const drivers: Record<string, Driver> = {
  pikvm,
  glkvm,
  nanokvm,
  jetkvm,
};

export function getDriver(id: string): Driver | undefined {
  return drivers[id];
}

export * from "./types.js";
