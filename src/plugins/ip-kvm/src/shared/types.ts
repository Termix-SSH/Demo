// Types shared by the backend routes and the frontend.

export type DriverId = "pikvm" | "glkvm" | "nanokvm" | "jetkvm";

export type DeviceStatus = "unknown" | "up" | "down";

export type PowerState = "on" | "off" | "unknown";

export type PowerAction = "on" | "graceful-shutdown" | "off" | "reset";

export interface CredentialField {
  key: string;
  type: "text" | "secret";
  required: boolean;
}

export interface DriverFeatures {
  // Termix draws the screen and sends the keys and mouse
  screen: boolean;
  // The browser connects to the device itself (JetKVM WebRTC)
  browserScreen: boolean;
  power: boolean;
  media: boolean;
  paste: boolean;
  snapshot: boolean;
}

export interface DriverInfo {
  id: DriverId;
  defaultPort: number;
  fields: CredentialField[];
  features: DriverFeatures;
  powerActions: PowerAction[];
}

export interface DeviceOptions {
  scheme?: "http" | "https";
  // SHA-256 of the device's own certificate, trusted as is
  pin?: string;
  // MAC of the machine behind the KVM, for Wake-on-LAN
  mac?: string;
  broadcast?: string;
}

/** The certificate a device shows, read without trusting it. */
export interface PeerCertificate {
  fingerprint: string;
  subject: string;
  issuer: string;
  validTo: string;
  expired: boolean;
  selfSigned: boolean;
}

export interface Reading {
  at: string;
  model?: string;
  version?: string;
  hostname?: string;
  power: PowerState;
  width?: number;
  height?: number;
  // The KVM says it has a video signal
  signal?: boolean;
}

export interface MediaImage {
  id: string;
  name: string;
  size?: number;
}

export interface MediaState {
  images: MediaImage[];
  mounted: string | null;
  cdrom: boolean;
  // The device can fetch an image from a web address
  fromUrl: boolean;
}

export interface Device {
  id: number;
  hostId: number | null;
  name: string;
  driver: DriverId;
  address: string;
  port: number | null;
  options: DeviceOptions;
  hasCa: boolean;
  pollSeconds: number;
  status: DeviceStatus;
  lastError: string | null;
  lastSeenAt: string | null;
  reading: Reading | null;
}

export interface DeviceInput {
  name?: string;
  hostId?: number | null;
  driver?: DriverId;
  address?: string;
  port?: number | null;
  options?: DeviceOptions;
  pollSeconds?: number;
  // Replaced only when sent
  ca?: string;
  credentials?: Record<string, string>;
}

/** One input event from the browser. Mouse positions are 0 to 1 of the screen. */
export type InputEvent =
  | { t: "key"; code: string; down: boolean }
  | { t: "move"; x: number; y: number }
  | { t: "button"; button: 0 | 1 | 2; down: boolean }
  | { t: "wheel"; dy: number }
  | { t: "text"; text: string };

export const SHORTCUTS: Record<string, string[]> = {
  "ctrl-alt-del": ["ControlLeft", "AltLeft", "Delete"],
  "alt-tab": ["AltLeft", "Tab"],
  "alt-f4": ["AltLeft", "F4"],
  "ctrl-esc": ["ControlLeft", "Escape"],
  "win-l": ["MetaLeft", "KeyL"],
  "win-d": ["MetaLeft", "KeyD"],
  "ctrl-alt-f1": ["ControlLeft", "AltLeft", "F1"],
  "ctrl-alt-f2": ["ControlLeft", "AltLeft", "F2"],
  "ctrl-alt-f7": ["ControlLeft", "AltLeft", "F7"],
  "print-screen": ["PrintScreen"],
};
