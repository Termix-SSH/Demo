import type {
  PluginAuthPolicyDecision,
  PluginAuthPolicyInput,
} from "@termix-ssh/plugin-sdk/backend";

export type SecondFactorRule = "off" | "new-device" | "always";

export interface LoginSecuritySettings {
  idleTimeoutMinutes: number;
  maxSessionHours: number;
  rememberDevice: boolean;
  secondFactor: SecondFactorRule;
  applyToExternal: boolean;
}

export const DEFAULT_SETTINGS: LoginSecuritySettings = {
  idleTimeoutMinutes: 0,
  maxSessionHours: 0,
  rememberDevice: true,
  secondFactor: "off",
  applyToExternal: false,
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
  return {
    idleTimeoutMinutes: wholeNumber(values.idleTimeoutMinutes),
    maxSessionHours: wholeNumber(values.maxSessionHours),
    rememberDevice: values.rememberDevice !== false,
    secondFactor: rule === "always" || rule === "new-device" ? rule : "off",
    applyToExternal: values.applyToExternal === true,
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
