import type { ReactNode } from "react";
import { cn } from "@termix-ssh/plugin-sdk/ui";

/**
 * The small bit of Markdown announcements use: headings, lists, paragraphs,
 * bold, italic, inline code and http(s) links. Built as React elements, never
 * as HTML, so a body can't inject anything.
 */

const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s](?:[^*]*[^*\s])?)\*|_([^_\s](?:[^_]*[^_\s])?)_|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

const isWebUrl = (url: string) => /^https?:\/\/\S+$/i.test(url);

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-brand hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const id = `${key}-${n++}`;
    const [whole, code, bold, label, href, star, under, bare] = match;
    if (code !== undefined) {
      out.push(
        <code key={id} className="bg-muted px-1 font-mono text-[0.95em]">
          {code}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(
        <strong key={id} className="font-semibold text-foreground">
          {inline(bold, id)}
        </strong>,
      );
    } else if (label !== undefined) {
      out.push(
        isWebUrl(href) ? (
          <Link key={id} href={href}>
            {inline(label, id)}
          </Link>
        ) : (
          <span key={id}>{inline(label, id)}</span>
        ),
      );
    } else if (star !== undefined || under !== undefined) {
      out.push(<em key={id}>{inline(star ?? under, id)}</em>);
    } else if (bare !== undefined) {
      out.push(
        <Link key={id} href={bare}>
          {bare}
        </Link>,
      );
    } else {
      out.push(whole);
    }
    last = start + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "p"; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) out.push(current);
    current = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const listKind = bullet ? "ul" : numbered ? "ol" : null;
    if (listKind) {
      if (current?.kind !== listKind) {
        flush();
        current = { kind: listKind, items: [] };
      }
      (current as { items: string[] }).items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (current?.kind !== "p") {
      flush();
      current = { kind: "p", lines: [] };
    }
    (current as { lines: string[] }).lines.push(line);
  }
  flush();
  return out;
}

export function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5 break-words", className)}>
      {blocks(text).map((block, index) => {
        const key = `b${index}`;
        if (block.kind === "heading") {
          return (
            <p key={key} className="font-semibold text-foreground">
              {inline(block.text, key)}
            </p>
          );
        }
        if (block.kind === "p") {
          return <p key={key}>{inline(block.lines.join(" "), key)}</p>;
        }
        const List = block.kind;
        return (
          <List
            key={key}
            className={cn(
              "flex flex-col gap-0.5 pl-4",
              List === "ul" ? "list-disc" : "list-decimal",
            )}
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>
                {inline(item, `${key}-${itemIndex}`)}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
