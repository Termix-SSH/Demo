import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Service } from "./service.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Host notes as actions: list, read, create and append. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("notes.list", {
    run: async (_input, context) => {
      const rows = await service.list({
        scope: "host",
        hostId: requireHost(context),
      });
      return {
        summary: `${rows.length} notes`,
        data: {
          rows: rows.map((row) => ({
            id: row.uid,
            name: row.title,
            tags: row.tags.join(", "),
            pinned: row.pinned,
          })),
          value: rows.length,
          status: "ok",
          label: `${rows.length} notes`,
        },
      };
    },
  });

  ctx.operations.register("notes.get", {
    run: async (input, context) => {
      requireHost(context);
      const note = await service.get(str(input.note));
      return {
        summary: note.title,
        data: { title: note.title, body: note.body, tags: note.tags },
      };
    },
  });

  ctx.operations.register("notes.create", {
    describe: (input) => `Create the note "${str(input.title)}"`,
    run: async (input, context) => {
      const note = await service.create({
        scope: "host",
        hostId: requireHost(context),
        folder: null,
        title: str(input.title).trim() || "Untitled",
        body: str(input.body),
        tags: [],
        pinned: false,
      });
      return {
        summary: `Created ${note.title}`,
        changed: true,
        data: { id: note.uid },
      };
    },
  });

  ctx.operations.register("notes.append", {
    describe: () => "Add text to a note",
    run: async (input, context) => {
      requireHost(context);
      const note = await service.append(str(input.note), str(input.text));
      return {
        summary: `Added to ${note.title}`,
        changed: true,
        data: { id: note.uid },
      };
    },
  });
}
