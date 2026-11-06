import type { ActionResult } from "../shared/types";

export interface Runner {
  busy: boolean;
  /**
   * Runs a change, toasts the result and shows git's output when it failed.
   * Answers true when it worked.
   */
  run: (
    title: string,
    work: () => Promise<ActionResult>,
    done: string,
  ) => Promise<boolean>;
}
