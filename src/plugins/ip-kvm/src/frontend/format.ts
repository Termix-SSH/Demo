export function statusTone(
  status: string,
  power: string | undefined,
): "ok" | "warn" | "bad" | "idle" {
  if (status === "down") return "bad";
  if (status === "up") return power === "off" ? "warn" : "ok";
  return "idle";
}
