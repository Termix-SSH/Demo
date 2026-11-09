import {
  isValidElement,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, SquareTerminal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { cn } from "@termix-ssh/plugin-sdk/ui";
import { toggleTask } from "./format";

/** The plain text inside a rendered code element. */
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({
  children,
  onSend,
}: {
  children: ReactNode;
  onSend?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = textOf(children).replace(/\n$/, "");

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="group relative my-2 border border-border bg-muted/40">
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={copy}
          title={t("code.copy")}
          aria-label={t("code.copy")}
          className="flex size-6 items-center justify-center border border-border bg-background text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
        {onSend && (
          <button
            type="button"
            onClick={() => onSend(text)}
            title={t("code.send")}
            aria-label={t("code.send")}
            className="flex size-6 items-center justify-center border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <SquareTerminal className="size-3" />
          </button>
        )}
      </div>
      <pre className="overflow-x-auto p-2 font-mono text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

/**
 * Markdown for notes. No raw HTML and no images, so a shared note cannot
 * load anything or inject markup. Task boxes toggle when onChange is given.
 */
export function NoteMarkdown({
  source,
  onSend,
  onChange,
  className,
}: {
  source: string;
  onSend?: (text: string) => void;
  onChange?: (next: string) => void;
  className?: string;
}) {
  const taskIndex = useRef(0);
  taskIndex.current = 0;

  return (
    <div
      className={cn(
        "text-sm leading-relaxed [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-3 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={{
          pre: ({ children }) => (
            <CodeBlock onSend={onSend}>{children}</CodeBlock>
          ),
          code: ({ className: cls, children, node: _node, ...rest }) => (
            <code
              {...rest}
              className={cn(
                cls
                  ? "font-mono"
                  : "bg-muted px-1 py-0.5 font-mono text-[0.85em]",
                cls,
              )}
            >
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-brand underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/40 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1">{children}</td>
          ),
          input: ({
            node: _node,
            ...props
          }: ComponentProps<"input"> & { node?: unknown }) => {
            if (props.type !== "checkbox") return <input {...props} />;
            const index = taskIndex.current++;
            return (
              <input
                type="checkbox"
                checked={Boolean(props.checked)}
                disabled={!onChange}
                onChange={() => onChange?.(toggleTask(source, index))}
                className="mr-1.5 align-middle"
              />
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
