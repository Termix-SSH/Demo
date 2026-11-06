import { diffLineClass } from "./format";

/** A diff with added and removed lines coloured. */
export function DiffText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="overflow-x-auto px-0 py-1 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} className={`px-3 whitespace-pre ${diffLineClass(line)}`}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}
