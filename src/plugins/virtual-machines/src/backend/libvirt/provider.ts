import {
  shellQuote as q,
  streamCommand,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { VmError } from "../errors.js";
import type { Remote } from "../remote.js";
import type { JobPlan, Target, VmProvider } from "../provider.js";
import { createJob, createSetup } from "./create.js";
import { spiceToVnc } from "./domain-xml.js";
import {
  addDiskScript,
  addNicScript,
  defineXmlScript,
  domainIdentity,
  hardwareScript,
  inactiveXmlScript,
  mediaScript,
  nextTarget,
  removeDiskScript,
  removeNicScript,
} from "./edit.js";
import { installScript } from "./install.js";
import {
  autostartScript,
  cloneJob,
  deleteScript,
  ownedPaths,
  powerScript,
} from "./lifecycle.js";
import {
  detailOf,
  parseAddresses,
  parseDomain,
  parseDomstats,
  sections,
  vmFromStats,
} from "./parse.js";
import {
  detailScript,
  inventoryScript,
  leasesScript,
  networksScript,
  parseInfo,
  parseInventory,
  parseLeases,
  parseNetworks,
  parseSnapshots,
  parseStatus,
  parseVolumes,
  prelude,
  snapshotsScript,
  statsScript,
  statusScript,
  volumesScript,
} from "./read.js";
import {
  downloadJob,
  networkActionScript,
  networkCreateScript,
  networkDeleteScript,
  poolActionScript,
  poolCreateScript,
  poolDeleteScript,
  snapshotCreateScript,
  snapshotDeleteScript,
  snapshotRevertScript,
  volumeCreateScript,
  volumeDeleteScript,
  volumePathScript,
} from "./storage.js";

const LONG_MS = 5 * 60_000;

export function createLibvirtProvider(remote: Remote): VmProvider {
  const read = async (target: Target, script: string, timeoutMs?: number) =>
    (
      await remote.read(target.hostId, target.settings.sudo, script, {
        timeoutMs,
      })
    ).stdout;
  const root = async (target: Target, script: string, timeoutMs?: number) =>
    (
      await remote.root(target.hostId, target.settings.sudo, script, {
        timeoutMs,
      })
    ).stdout;

  async function facts(target: Target, uuid: string) {
    const stdout = await read(target, detailScript(target.settings.uri, uuid));
    const parts = sections(stdout);
    const info = parseInfo(parts.get("info") ?? []);
    const name = info.Name ?? "";
    const stats = parseDomstats(parts.get("stats") ?? []);
    const row = vmFromStats(
      uuid,
      name,
      stats.get(name) ?? new Map(),
      info.Autostart === "enable",
      parseAddresses(parts.get("ip") ?? []),
    );
    return {
      row,
      domain: parseDomain((parts.get("xml") ?? []).join("\n")),
      persistent: info.Persistent === "yes",
    };
  }

  const inactiveXml = (target: Target, uuid: string) =>
    root(target, inactiveXmlScript(target.settings.uri, uuid));

  return {
    async status(target) {
      return parseStatus(
        (
          await remote.read(
            target.hostId,
            target.settings.sudo,
            statusScript(target.settings.uri),
            { allowFail: true },
          )
        ).stdout,
      );
    },

    async install(target) {
      const status = await this.status(target);
      await root(target, installScript(status.packageManager), 9 * 60_000);
    },

    async inventory(target) {
      return parseInventory(
        await read(target, inventoryScript(target.settings.uri), 45_000),
      );
    },

    async detail(target, uuid) {
      const { row, domain, persistent } = await facts(target, uuid);
      return detailOf(row, domain, persistent, false);
    },

    async stats(target, uuid) {
      const stdout = await read(target, statsScript(target.settings.uri, uuid));
      const stats = [
        ...parseDomstats(sections(stdout).get("stats") ?? []).entries(),
      ][0];
      if (!stats) throw new VmError("VM not found", 404);
      return vmFromStats(uuid, stats[0], stats[1], false, []);
    },

    async power(target, uuid, action) {
      await root(target, powerScript(target.settings.uri, uuid, action));
    },

    async autostart(target, uuid, on) {
      await root(target, autostartScript(target.settings.uri, uuid, on));
    },

    async remove(target, uuid, withDisks) {
      const { row, domain } = await facts(target, uuid);
      const stdout = await root(
        target,
        deleteScript(
          target.settings.uri,
          uuid,
          row.name,
          withDisks ? ownedPaths(domain.diskDevices, row.name) : [],
        ),
        LONG_MS,
      );
      const lines = stdout.split("\n");
      const pick = (key: string) =>
        lines
          .filter((line) => line.startsWith(`${key}=`))
          .map((line) => line.slice(key.length + 1));
      return { removed: pick("removed"), kept: pick("kept") };
    },

    async planCreate(target, vm) {
      let isoPath = "";
      if (vm.source.type === "iso") {
        isoPath = (
          await read(
            target,
            volumePathScript(target.settings.uri, vm.pool, vm.source.volume),
          )
        ).trim();
      }
      return {
        setup: createSetup(vm),
        body: createJob(target.settings.uri, vm, isoPath),
        label: vm.name,
        vmName: vm.name,
      };
    },

    async planClone(target, uuid, name) {
      const { domain } = await facts(target, uuid);
      return {
        setup: "",
        body: cloneJob(
          target.settings.uri,
          uuid,
          name,
          await inactiveXml(target, uuid),
          domain.diskDevices,
        ),
        label: name,
        vmName: name,
      };
    },

    planDownload(target, pool, name, url): JobPlan {
      return {
        setup: "",
        body: downloadJob(target.settings.uri, pool, name, url),
        label: name,
        vmName: "",
      };
    },

    async planSnapshot(target, uuid, name, description) {
      const { row, domain } = await facts(target, uuid);
      const blocked = detailOf(row, domain, true, false).snapshotBlock;
      if (blocked) throw new VmError(blocked);
      return {
        setup: "",
        body: snapshotCreateScript(
          target.settings.uri,
          uuid,
          name,
          description,
        ),
        label: `${row.name}: ${name}`,
        vmName: row.name,
      };
    },

    async setHardware(target, uuid, change) {
      await root(target, hardwareScript(target.settings.uri, uuid, change));
    },

    async addDisk(target, uuid, pool, gib) {
      const { row, domain } = await facts(target, uuid);
      const disk = nextTarget(domain.diskDevices, "vd");
      await root(
        target,
        addDiskScript(
          target.settings.uri,
          uuid,
          pool,
          `${row.name}-${disk}.qcow2`,
          gib,
          disk,
          row.state === "running",
        ),
      );
      return disk;
    },

    async removeDisk(target, uuid, disk) {
      const { row } = await facts(target, uuid);
      await root(
        target,
        removeDiskScript(
          target.settings.uri,
          uuid,
          disk,
          row.state === "running",
        ),
      );
    },

    async setMedia(target, uuid, pool, volume) {
      const { domain } = await facts(target, uuid);
      const drive = domain.diskDevices.find((d) => d.device === "cdrom");
      const path = volume
        ? (
            await read(
              target,
              volumePathScript(target.settings.uri, pool, volume),
            )
          ).trim()
        : "";
      if (!path && !drive) return;
      await root(
        target,
        mediaScript(
          target.settings.uri,
          uuid,
          drive?.target ?? nextTarget(domain.diskDevices, "sd"),
          path,
          !!drive,
        ),
      );
    },

    async addNic(target, uuid, type, source) {
      const { row } = await facts(target, uuid);
      await root(
        target,
        addNicScript(
          target.settings.uri,
          uuid,
          type,
          source,
          row.state === "running",
        ),
      );
    },

    async removeNic(target, uuid, mac) {
      const { row, domain } = await facts(target, uuid);
      const nic = domain.nicDevices.find((n) => n.mac === mac);
      if (!nic) throw new VmError("That network card is not on this VM", 404);
      await root(
        target,
        removeNicScript(
          target.settings.uri,
          uuid,
          nic.type,
          mac,
          row.state === "running",
        ),
      );
    },

    readConfig: inactiveXml,

    async writeConfig(target, uuid, text) {
      const before = domainIdentity(await inactiveXml(target, uuid));
      const after = domainIdentity(text);
      if (after.uuid !== before.uuid || after.name !== before.name) {
        throw new VmError(
          "Keep the name and uuid as they are. Use Clone to make a new VM.",
        );
      }
      await root(target, defineXmlScript(target.settings.uri, uuid, text));
    },

    async useVnc(target, uuid) {
      const text = await inactiveXml(target, uuid);
      const next = spiceToVnc(text);
      if (next === text) throw new VmError("This VM has no SPICE display");
      await root(target, defineXmlScript(target.settings.uri, uuid, next));
    },

    async display(target, uuid) {
      // Holds the VNC password, so this one is never sent to the browser.
      const domain = parseDomain(
        await root(
          target,
          `${prelude(target.settings.uri)}V dumpxml ${q(uuid)} --security-info
`,
        ),
      );
      const vnc = domain.graphics.find((g) => g.type === "vnc");
      if (!vnc) {
        throw new VmError("This VM has no VNC display", 409, {
          code: domain.graphics.some((g) => g.type === "spice")
            ? "spice"
            : "no-display",
        });
      }
      if (vnc.port < 1) {
        throw new VmError("Start the VM to see its display", 409, {
          code: "not-running",
        });
      }
      if (!vnc.address) {
        throw new VmError("This VM's display uses a socket, not a port");
      }
      const any = vnc.address === "0.0.0.0" || vnc.address === "::";
      return {
        address: any ? "127.0.0.1" : vnc.address,
        port: vnc.port,
        password: domain.vncPassword,
      };
    },

    serialCommand(target, uuid) {
      return streamCommand(
        `exec virsh -c ${q(target.settings.uri)} console ${q(uuid)} --force`,
        target.settings.sudo,
      );
    },

    async snapshots(target, uuid) {
      return parseSnapshots(
        await read(target, snapshotsScript(target.settings.uri, uuid)),
      );
    },

    async revertSnapshot(target, uuid, name) {
      await root(
        target,
        snapshotRevertScript(target.settings.uri, uuid, name),
        LONG_MS,
      );
    },

    async deleteSnapshot(target, uuid, name) {
      await root(
        target,
        snapshotDeleteScript(target.settings.uri, uuid, name),
        LONG_MS,
      );
    },

    async volumes(target, pool) {
      return parseVolumes(
        await read(target, volumesScript(target.settings.uri, pool)),
      );
    },

    async createPool(target, name, path) {
      await root(target, poolCreateScript(target.settings.uri, name, path));
    },

    async poolAction(target, name, action) {
      await root(target, poolActionScript(target.settings.uri, name, action));
    },

    async deletePool(target, name) {
      await root(target, poolDeleteScript(target.settings.uri, name));
    },

    async createVolume(target, pool, name, gib) {
      await root(
        target,
        volumeCreateScript(target.settings.uri, pool, name, gib),
      );
    },

    async deleteVolume(target, pool, name) {
      await root(target, volumeDeleteScript(target.settings.uri, pool, name));
    },

    async networks(target) {
      return parseNetworks(
        await read(target, networksScript(target.settings.uri)),
      );
    },

    async leases(target, network) {
      return parseLeases(
        await read(target, leasesScript(target.settings.uri, network)),
      );
    },

    async createNetwork(target, name, kind) {
      await root(target, networkCreateScript(target.settings.uri, name, kind));
    },

    async networkAction(target, name, action) {
      await root(
        target,
        networkActionScript(target.settings.uri, name, action),
      );
    },

    async deleteNetwork(target, name) {
      await root(target, networkDeleteScript(target.settings.uri, name));
    },
  };
}
