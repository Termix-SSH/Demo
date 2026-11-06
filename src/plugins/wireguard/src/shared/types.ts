export interface WireguardStatus {
  root: boolean;
  os: string;
  packageManager: string;
  installed: boolean;
  version: string;
  init: string;
  ipForward: boolean;
  firewall: string;
  iptables: boolean;
}

export interface InterfaceView {
  name: string;
  active: boolean;
  enabled: boolean;
  address: string[];
  listenPort: number;
  publicKey: string;
  endpoint: string;
  dns: string;
  allowedIps: string;
  keepalive: number;
  nat: boolean;
  clients: number;
}

export interface ClientView {
  name: string;
  publicKey: string;
  allowedIps: string[];
  enabled: boolean;
  /** Made by Termix, so its config file can be downloaded again. */
  managed: boolean;
  hasConfig: boolean;
  endpoint: string;
  latestHandshake: number;
  rx: number;
  tx: number;
}

export interface CreateInterfaceBody {
  name: string;
  address: string;
  listenPort: number;
  endpoint: string;
  dns: string;
  allowedIps: string;
  keepalive: number;
  nat: boolean;
  forwarding: boolean;
  openFirewall: boolean;
  start: boolean;
}

export interface UpdateInterfaceBody {
  listenPort: number;
  endpoint: string;
  dns: string;
  allowedIps: string;
  keepalive: number;
}

export interface ClientConfig {
  name: string;
  config: string;
}

export interface ConfigView {
  text: string;
}

/** One host in the WireGuard dashboard card. */
export interface WireguardHostSummary {
  hostId: number;
  checkedAt: string;
  installed: boolean;
  /** All interfaces found on the host. */
  total: number;
  /** Interfaces that are active. */
  up: number;
  /** Interfaces set to start at boot that are not active. */
  down: number;
  /** Names of the interfaces counted in `down`. */
  downNames: string[];
  clients: number;
  error?: string;
}
