import { Checkbox } from "@termix-ssh/plugin-sdk/ui";
import type { MonitorView } from "../shared/types";

/** Tick boxes over monitors, by key. */
export function MonitorPicker({
  monitors,
  picked,
  onChange,
}: {
  monitors: MonitorView[];
  picked: string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
      {monitors.map((monitor) => (
        <label
          key={monitor.key}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <Checkbox
            checked={picked.includes(monitor.key)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...picked, monitor.key]
                  : picked.filter((key) => key !== monitor.key),
              )
            }
          />
          <span className="truncate">{monitor.name}</span>
        </label>
      ))}
    </div>
  );
}
