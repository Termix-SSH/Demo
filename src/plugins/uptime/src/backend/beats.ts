import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  STATUS_LETTERS,
  STATUS_NAMES,
  type BeatView,
  type MonitorStatus,
} from "../shared/types.js";

export const RING_SIZE = 1440;
const MAGIC = 0x55544d31;
const NO_LATENCY = 0xffffffff;
const HEADER = 8;
const ENTRY_HEADER = 12;
const SLOT = 9;

class Ring {
  readonly times = new Uint32Array(RING_SIZE);
  readonly latency = new Uint32Array(RING_SIZE);
  readonly status = new Uint8Array(RING_SIZE);
  next = 0;
  count = 0;

  push(at: number, status: number, latency: number): void {
    this.times[this.next] = at;
    this.status[this.next] = status;
    this.latency[this.next] = latency;
    this.next = (this.next + 1) % RING_SIZE;
    this.count = Math.min(this.count + 1, RING_SIZE);
  }

  /** Slot numbers, oldest first. */
  *slots(): Generator<number> {
    const start = (this.next - this.count + RING_SIZE) % RING_SIZE;
    for (let index = 0; index < this.count; index++) {
      yield (start + index) % RING_SIZE;
    }
  }
}

/**
 * The last checks of every monitor. Whole file SQLite saves make single beats
 * too costly for the database, so they live in memory and in one small file of
 * numbers, written now and then. Losing a few minutes of them on a crash is fine.
 */
export class BeatStore {
  private readonly rings = new Map<number, Ring>();

  add(
    monitorId: number,
    atMs: number,
    status: MonitorStatus,
    latencyMs: number | null,
  ): void {
    let ring = this.rings.get(monitorId);
    if (!ring) {
      ring = new Ring();
      this.rings.set(monitorId, ring);
    }
    ring.push(
      Math.floor(atMs / 1000),
      STATUS_LETTERS[status],
      latencyMs === null ? NO_LATENCY : Math.max(0, Math.round(latencyMs)),
    );
  }

  /** Newest last. */
  list(monitorId: number, limit = RING_SIZE, sinceSec = 0): BeatView[] {
    const ring = this.rings.get(monitorId);
    if (!ring) return [];
    const beats: BeatView[] = [];
    for (const slot of ring.slots()) {
      if (ring.times[slot] < sinceSec) continue;
      const latency = ring.latency[slot];
      beats.push({
        t: ring.times[slot],
        s: STATUS_NAMES[ring.status[slot]] ?? "unknown",
        ms: latency === NO_LATENCY ? null : latency,
      });
    }
    return beats.slice(-limit);
  }

  forget(monitorId: number): void {
    this.rings.delete(monitorId);
  }

  keepOnly(ids: Set<number>): void {
    for (const id of this.rings.keys()) {
      if (!ids.has(id)) this.rings.delete(id);
    }
  }

  encode(): Buffer {
    let size = HEADER;
    for (const ring of this.rings.values()) {
      size += ENTRY_HEADER + ring.count * SLOT;
    }
    const buffer = Buffer.alloc(size);
    buffer.writeUInt32LE(MAGIC, 0);
    buffer.writeUInt32LE(this.rings.size, 4);
    let at = HEADER;
    for (const [id, ring] of this.rings) {
      buffer.writeUInt32LE(id, at);
      buffer.writeUInt32LE(ring.count, at + 4);
      at += ENTRY_HEADER;
      for (const slot of ring.slots()) {
        buffer.writeUInt32LE(ring.times[slot], at);
        buffer.writeUInt32LE(ring.latency[slot], at + 4);
        buffer.writeUInt8(ring.status[slot], at + 8);
        at += SLOT;
      }
    }
    return buffer;
  }

  /** Reads what it can. A damaged file only loses history. */
  decode(buffer: Buffer): void {
    if (buffer.length < HEADER || buffer.readUInt32LE(0) !== MAGIC) return;
    const rings = buffer.readUInt32LE(4);
    let at = HEADER;
    for (let index = 0; index < rings; index++) {
      if (at + ENTRY_HEADER > buffer.length) return;
      const id = buffer.readUInt32LE(at);
      const count = Math.min(buffer.readUInt32LE(at + 4), RING_SIZE);
      at += ENTRY_HEADER;
      if (at + count * SLOT > buffer.length) return;
      const ring = new Ring();
      for (let slot = 0; slot < count; slot++) {
        ring.push(
          buffer.readUInt32LE(at),
          buffer.readUInt8(at + 8),
          buffer.readUInt32LE(at + 4),
        );
        at += SLOT;
      }
      this.rings.set(id, ring);
    }
  }

  async save(folder: string): Promise<void> {
    const file = path.join(folder, "beats.bin");
    const temp = `${file}.tmp`;
    await writeFile(temp, this.encode());
    await rename(temp, file);
  }

  async load(folder: string): Promise<void> {
    try {
      this.decode(await readFile(path.join(folder, "beats.bin")));
    } catch {
      // First start.
    }
  }
}
