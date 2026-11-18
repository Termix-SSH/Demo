import { useEffect, useState } from "react";
import { getUserInfo, getUserRoles } from "@termix-ssh/plugin-sdk/ui";
import { usePluginApi } from "@termix-ssh/plugin-sdk/frontend";

export type InterfacePreset = "simple" | "balanced" | "advanced";

export interface InterfaceTemplate {
  preset: InterfacePreset;
  pins: string[];
  locked: boolean;
}

export interface InterfaceDefaults {
  everyone: InterfaceTemplate | null;
  roles: Record<string, InterfaceTemplate>;
}

interface State {
  defaults: InterfaceDefaults | null;
  /** The signed in user's role names, in the order core lists them. */
  roles: string[];
  loaded: boolean;
}

let state: State = { defaults: null, roles: [], loaded: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

type Api = ReturnType<typeof usePluginApi>;

function load(api: Api) {
  if (loading) return loading;
  loading = (async () => {
    const [defaults, roles] = await Promise.all([
      api
        .get<InterfaceDefaults>("/interface-defaults")
        .then((res) => res.data)
        .catch(() => null),
      getUserInfo()
        .then(async (info) =>
          // A linked desktop gets the server account's roles with its info.
          info.linked
            ? info.linked.roles
            : ((await getUserRoles(info.userId)).roles ?? []).map(
                (role) => role.roleName,
              ),
        )
        .catch(() => [] as string[]),
    ]);
    publish({ defaults, roles, loaded: true });
  })();
  return loading;
}

/** The template for these roles: the first role that has one, else everyone's. */
export function templateFor(
  defaults: InterfaceDefaults | null,
  roles: string[],
): InterfaceTemplate | null {
  if (!defaults) return null;
  for (const role of roles) {
    const template = defaults.roles[role];
    if (template) return template;
  }
  return defaults.everyone;
}

/** The admin's interface defaults and the one that applies to this user. */
export function useInterfaceDefaults() {
  const api = usePluginApi();
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    void load(api);
    return () => {
      listeners.delete(listener);
    };
  }, [api]);
  return {
    defaults: state.defaults,
    template: templateFor(state.defaults, state.roles),
    loaded: state.loaded,
    save: async (next: InterfaceDefaults) => {
      const saved = (
        await api.put<InterfaceDefaults>("/interface-defaults", next)
      ).data;
      publish({ defaults: saved });
      return saved;
    },
  };
}

/** For tests. */
export function resetInterfaceDefaults() {
  state = { defaults: null, roles: [], loaded: false };
  loading = null;
}
