import type { SlotContribution } from "@termix-ssh/plugin-sdk/frontend";

/**
 * The contributions a menu draws as its own items. A framed plugin's
 * component can't join a menu, so plugins add plain items instead.
 */
export function slotMenuItems(
  contributions: SlotContribution[],
): SlotContribution[] {
  return contributions.filter(
    (item) => item.kind !== "component" && item.kind !== "data",
  );
}
