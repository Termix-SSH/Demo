import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Fingerprint, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/button";
import { GroupHeading, PANEL, PanelShell } from "@/components/panel-layout";
import { getPublishedKeys, getTermixId } from "@/demo/demo-api";
import type { DemoPublishedKey } from "@/demo/demo-data";

/**
 * Mirrors the real TermixIdPanel: the handle others resolve your keys from,
 * the keys themselves, and the small certificate authority that lets a server
 * trust one key instead of a list.
 */
export function DemoTermixId({ chrome = true }: { chrome?: boolean }) {
  const [id, setId] = useState<Awaited<ReturnType<typeof getTermixId>> | null>(
    null,
  );
  const [keys, setKeys] = useState<DemoPublishedKey[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTermixId(), getPublishedKeys()]).then(
      ([termixId, published]) => {
        if (cancelled) return;
        setId(termixId);
        setKeys(published);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  if (!id) return <div className="h-full" />;

  const publishedCount = keys.filter((key) => key.published).length;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(id!.resolverUrl);
    } catch {
      // Nothing useful to say if the clipboard is blocked.
    }
    setCopied(true);
  }

  return (
    <PanelShell
      chrome={chrome}
      icon={<Fingerprint className="size-4" />}
      title="Termix ID"
      status={`${publishedCount} of ${keys.length} published`}
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      <GroupHeading title="Handle" />
      <div className="flex items-center gap-2 border border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">{id.handle}</span>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {id.resolverUrl}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Copy the resolver URL"
          onClick={copyUrl}
          className={
            copied
              ? "shrink-0 text-accent-brand"
              : "shrink-0 text-muted-foreground hover:text-foreground"
          }
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <GroupHeading title="Keys" count={keys.length} />
        <Button
          variant="ghost"
          size="icon-xs"
          title="Add a key"
          className="shrink-0"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {keys.map((key) => (
        <div
          key={key.id}
          className={`group flex items-center gap-2 border border-border px-3 py-2 ${
            key.published ? "" : "opacity-60"
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium">{key.label}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {key.fingerprint}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            title={key.published ? "Stop publishing" : "Publish"}
            onClick={() =>
              setKeys((prev) =>
                prev.map((k) =>
                  k.id === key.id ? { ...k, published: !k.published } : k,
                ),
              )
            }
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {key.published ? (
              <Eye className="size-3" />
            ) : (
              <EyeOff className="size-3" />
            )}
          </Button>
        </div>
      ))}

      <GroupHeading title="Certificate authority" />
      <div className="flex flex-col gap-2 border border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 shrink-0 text-accent-brand" />
          <span className="text-xs font-medium">
            {id.caEnabled ? "Enabled" : "Not set up"}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            Certificates valid {id.certValidityDays} days
          </span>
        </div>
        <span className="break-all font-mono text-[10px] text-muted-foreground">
          {id.caFingerprint}
        </span>
        <Button variant="outline" size="sm" className="h-8 w-full">
          Issue a certificate
        </Button>
      </div>
    </PanelShell>
  );
}
