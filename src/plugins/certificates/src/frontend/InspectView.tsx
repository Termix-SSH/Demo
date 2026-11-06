import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Input,
  ListBadge,
  Segmented,
  TileStack,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { CertStatus, InspectResult } from "../shared/types";
import { errorMessage, inspectFile, inspectRemote } from "./api";
import { ChainCard } from "./ChainView";

type Mode = "server" | "file";

/** Reads a certificate file on the host, or a server's chain from the host. */
export function InspectView({
  hostId,
  status,
}: {
  hostId: number;
  status: CertStatus;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("server");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("443");
  const [path, setPath] = useState("");
  const [result, setResult] = useState<InspectResult | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);

  const ready = mode === "server" ? !!address.trim() : !!path.trim();

  const check = async () => {
    if (!ready) return;
    setLoading(true);
    setFailed("");
    setResult(null);
    try {
      setResult(
        mode === "server"
          ? await inspectRemote(hostId, address.trim(), Number(port) || 443)
          : await inspectFile(hostId, path.trim()),
      );
    } catch (e) {
      setFailed(errorMessage(e, t("inspect.failed")));
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: { key: string }) => {
    if (e.key === "Enter") void check();
  };

  if (!status.openssl) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
        {t("inspect.noOpenssl")}
      </p>
    );
  }

  const verified = result?.verify.startsWith("0");

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "server", label: t("inspect.server") },
            { value: "file", label: t("inspect.file") },
          ]}
        />
        {mode === "server" ? (
          <>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={onKey}
              placeholder={t("inspect.addressPlaceholder")}
              aria-label={t("inspect.address")}
              className="h-8 min-w-48 flex-1 font-mono text-xs"
            />
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              onKeyDown={onKey}
              aria-label={t("inspect.port")}
              className="h-8 w-20 font-mono text-xs"
            />
          </>
        ) : (
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={onKey}
            placeholder="/etc/ssl/certs/server.pem"
            aria-label={t("inspect.path")}
            className="h-8 min-w-48 flex-1 font-mono text-xs"
          />
        )}
        <Button
          size="sm"
          disabled={!ready || loading}
          onClick={() => void check()}
        >
          {t("inspect.check")}
        </Button>
      </ToolbarBand>
      {loading ? (
        <LoadingState />
      ) : failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !result ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("inspect.hint")}
        </p>
      ) : (
        <>
          {result.verify && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
              <ListBadge tone={verified ? "success" : "destructive"}>
                {verified ? t("inspect.trusted") : t("inspect.notTrusted")}
              </ListBadge>
              <span className="truncate font-mono text-muted-foreground">
                {result.verify}
              </span>
            </div>
          )}
          <TileStack>
            {result.chain.map((cert, index) => (
              <ChainCard
                key={cert.fingerprint || index}
                cert={cert}
                index={index}
                warnDays={status.warnDays}
              />
            ))}
          </TileStack>
        </>
      )}
    </div>
  );
}
