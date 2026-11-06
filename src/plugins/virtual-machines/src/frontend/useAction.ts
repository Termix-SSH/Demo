import { useCallback, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { errorMessage } from "./api";

/** Runs a change with a busy flag, a toast and a reload. */
export function useAction(reload?: () => unknown) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (work: () => Promise<unknown>, done?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        if (done) toast.success(done);
        await reload?.();
        return true;
      } catch (error) {
        toast.error(errorMessage(error, t("common.failed")));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload, t, toast],
  );

  return { busy, run };
}
