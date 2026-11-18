import * as frontend from "@termix-ssh/plugin-sdk/frontend";

type Hook = (on: boolean) => void;

const noop: Hook = () => {};

/**
 * Termix scrolls the tab, so parts from other plugins move with the page.
 * Termix before 26.11.2 has no such hook and the page keeps its own scroll.
 */
export const useShellScroll: Hook = (() => {
  try {
    return (
      (frontend as unknown as { useShellScroll?: Hook }).useShellScroll ?? noop
    );
  } catch {
    return noop;
  }
})();
