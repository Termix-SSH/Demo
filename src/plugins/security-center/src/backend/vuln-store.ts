import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VulnScan } from "../shared/types.js";

/** The last vulnerability scan of each host, kept on disk so a restart keeps it. */
export class VulnStore {
  constructor(private readonly dir: string) {}

  private file(hostId: number): string {
    return path.join(this.dir, `vulns-${hostId}.json`);
  }

  async load(hostId: number): Promise<VulnScan | null> {
    try {
      const data = JSON.parse(
        await readFile(this.file(hostId), "utf8"),
      ) as VulnScan;
      return Array.isArray(data.vulns) ? data : null;
    } catch {
      return null;
    }
  }

  async save(hostId: number, scan: VulnScan): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(hostId)}.tmp`;
    await writeFile(tmp, JSON.stringify(scan));
    await rename(tmp, this.file(hostId));
  }

  async drop(hostId: number): Promise<void> {
    await rm(this.file(hostId), { force: true });
  }
}
