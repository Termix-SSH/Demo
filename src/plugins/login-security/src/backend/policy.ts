import type {
  PluginAuthPolicyDecision,
  PluginAuthPolicyInput,
  PluginConnectPolicyDecision,
  PluginConnectPolicyInput,
} from "@termix-ssh/plugin-sdk/backend";

export type SecondFactorRule = "off" | "new-device" | "always";
export type ConnectFactorRule = "off" | "marked" | "all";

/** The tab that asks for the second factor. */
export const VERIFY_TAB = "connect-verify";

export interface LoginSecuritySettings {
  idleTimeoutMinutes: number;
  maxSessionHours: number;
  rememberDevice: boolean;
  secondFactor: SecondFactorRule;
  applyToExternal: boolean;
  connectFactor: ConnectFactorRule;
  connectFactorMinutes: number;
}

export const DEFAULT_SETTINGS: LoginSecuritySettings = {
  idleTimeoutMinutes: 0,
  maxSessionHours: 0,
  rememberDevice: true,
  secondFactor: "off",
  applyToExternal: false,
  connectFactor: "off",
  connectFactorMinutes: 60,
};

function wholeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** Settings as stored, with anything odd turned into "off". */
export function readSettings(
  values: Record<string, unknown>,
): LoginSecuritySettings {
  const rule = values.secondFactor;
  const connect = values.connectFactor;
  return {
    idleTimeoutMinutes: wholeNumber(values.idleTimeoutMinutes),
    maxSessionHours: wholeNumber(values.maxSessionHours),
    rememberDevice: values.rememberDevice !== false,
    secondFactor: rule === "always" || rule === "new-device" ? rule : "off",
    applyToExternal: values.applyToExternal === true,
    connectFactor: connect === "all" || connect === "marked" ? connect : "off",
    connectFactorMinutes:
      wholeNumber(values.connectFactorMinutes) ||
      DEFAULT_SETTINGS.connectFactorMinutes,
  };
}

export function decide(
  settings: LoginSecuritySettings,
  input: Pick<PluginAuthPolicyInput, "external">,
): PluginAuthPolicyDecision {
  const decision: PluginAuthPolicyDecision = {};
  if (!settings.rememberDevice) decision.allowRememberDevice = false;
  if (settings.maxSessionHours > 0) {
    decision.maxSessionSeconds = settings.maxSessionHours * 3600;
  }
  if (settings.idleTimeoutMinutes > 0) {
    decision.idleTimeoutSeconds = settings.idleTimeoutMinutes * 60;
  }
  if (
    settings.secondFactor !== "off" &&
    (!input.external || settings.applyToExternal)
  ) {
    decision.secondFactor = settings.secondFactor;
  }
  return decision;
}

/** Whether this connect needs the host marked for it, so the setting is read only then. */
export function connectFactorApplies(
  settings: LoginSecuritySettings,
  input: Pick<PluginConnectPolicyInput, "interactive" | "stepUpAt">,
  now = Date.now(),
): boolean {
  if (settings.connectFactor === "off" || !input.interactive) return false;
  const window = settings.connectFactorMinutes * 60_000;
  return !input.stepUpAt || now - input.stepUpAt >= window;
}

export const VERIFY_DECISION: PluginConnectPolicyDecision = {
  decision: "request",
  reason: "Enter your second factor to connect to this host.",
  requestTab: VERIFY_TAB,
  requestKind: "verify",
};
