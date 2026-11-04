import { useCallback, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useConfirm } from "@termix-ssh/plugin-sdk/ui";
import type { ChangeResult } from "../shared/types";
import { errorCode, errorMessage, errorReason } from "./api";

/**
 * Runs a firewall change. When the server says it could lock Termix out, asks
 * once and runs it again with force. A change that needs Keep shows up in the
 * pending banner after the reload.
 */
export function useChange(reload: () => Promise<void> | void) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      work: (force: boolean) => Promise<ChangeResult | void>,
      done: string,
    ): Promise<boolean> => {
      setBusy(true);
      try {
        let result: ChangeResult | void;
        try {
          result = await work(false);
        } catch (e) {
          if (errorCode(e) !== "SSH_LOCKOUT") throw e;
          const ok = await confirm({
            title: t("lockout.title"),
            description: t("lockout.description", {
              reason: errorReason(e) || errorMessage(e, ""),
            }),
            confirmLabel: t("lockout.confirm"),
            destructive: true,
          });
          if (!ok) return false;
          result = await work(true);
        }
        toast.success(result && result.pending ? t("pending.started") : done);
        return true;
      } catch (e) {
        const code = errorCode(e);
        toast.error(
          code === "pending"
            ? t("pending.first")
            : code === "stale"
              ? t("rules.stale")
              : errorMessage(e, t("common.failed")),
        );
        return false;
      } finally {
        setBusy(false);
        await reload();
      }
    },
    [confirm, reload, t, toast],
  );

  return { run, busy };
}
