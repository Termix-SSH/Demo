/**
 * The demo only ever runs in a browser, so `window.electronAPI` is always
 * undefined. Copied files still reference it on the desktop-only paths, so this
 * declares just enough of the surface for them to typecheck.
 */
interface ElectronAPI {
  isElectron?: boolean;
  getPlatform: () => Promise<string>;
  openNativeRdp: (options: {
    host: string;
    port?: number;
    username?: string;
    domain?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
  onRemoteSyncStatusChanged?: (listener: () => void) => () => void;
  startC2SAutoStartTunnels?: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
