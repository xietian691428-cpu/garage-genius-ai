/**
 * Android Classic Bluetooth (RFCOMM/SPP) transport for ELM327 adapters.
 * Implements the same ObdTransport byte-pipe as native BLE / Web Bluetooth.
 */

import {
  ObdClassicBluetooth,
  isObdClassicPluginAvailable,
  type ObdClassicDevice,
} from "@/lib/obd-classic-plugin";
import type { ObdTransport } from "@/lib/obd-transport";
import { nameLooksLikeObdAdapter } from "@/lib/obd-transport";

export type ClassicScanDevice = ObdClassicDevice;

export function isNativeClassicRuntime(): boolean {
  return isObdClassicPluginAvailable();
}

export async function listBondedClassicDevices(): Promise<ClassicScanDevice[]> {
  if (!isNativeClassicRuntime()) return [];
  const { devices } = await ObdClassicBluetooth.listBonded();
  return devices;
}

/**
 * Start Classic inquiry. Prefer bonded list first in UI; discovery finds unpaired
 * adapters (user may need to pair via the system dialog on connect).
 */
export async function startClassicDiscovery(
  onDevice: (device: ClassicScanDevice) => void,
): Promise<() => Promise<void>> {
  if (!isNativeClassicRuntime()) {
    throw new Error("Classic Bluetooth is only available in the Android app.");
  }
  const handles = [
    await ObdClassicBluetooth.addListener("deviceFound", (ev) => {
      if (!ev.address) return;
      onDevice({
        address: ev.address,
        name: ev.name || ev.address,
        rssi: ev.rssi,
      });
    }),
  ];
  await ObdClassicBluetooth.startDiscovery();
  return async () => {
    await ObdClassicBluetooth.stopDiscovery().catch(() => undefined);
    for (const h of handles) await h.remove();
  };
}

export async function stopClassicDiscovery(): Promise<void> {
  if (!isNativeClassicRuntime()) return;
  await ObdClassicBluetooth.stopDiscovery().catch(() => undefined);
}

export class NativeClassicTransport implements ObdTransport {
  readonly kind = "native-classic" as const;
  private alive = true;
  private dataListeners = new Set<(chunk: string) => void>();
  private disconnectListeners = new Set<() => void>();
  private unsub: Array<() => void | Promise<void>> = [];

  private constructor(readonly deviceName: string) {}

  static async connect(options: {
    address: string;
    deviceName?: string;
    insecure?: boolean;
  }): Promise<NativeClassicTransport> {
    if (!isNativeClassicRuntime()) {
      throw new Error("Classic Bluetooth is only available in the Android app.");
    }
    await stopClassicDiscovery();
    const t = new NativeClassicTransport(
      options.deviceName?.trim() || options.address,
    );
    const dataHandle = await ObdClassicBluetooth.addListener("data", (ev) => {
      if (ev.data) t.emitData(ev.data);
    });
    const discHandle = await ObdClassicBluetooth.addListener("disconnect", () => {
      t.markDisconnected();
    });
    t.unsub.push(
      () => dataHandle.remove(),
      () => discHandle.remove(),
    );
    try {
      await ObdClassicBluetooth.connect({
        address: options.address,
        insecure: options.insecure,
      });
    } catch (err) {
      t.disconnect();
      throw err;
    }
    return t;
  }

  get connected(): boolean {
    return this.alive;
  }

  private emitData(chunk: string) {
    if (!this.alive) return;
    for (const l of this.dataListeners) l(chunk);
  }

  private markDisconnected() {
    if (!this.alive) return;
    this.alive = false;
    for (const l of this.disconnectListeners) l();
  }

  async write(text: string): Promise<void> {
    if (!this.alive) throw new Error("OBD adapter disconnected");
    await ObdClassicBluetooth.write({ data: text });
  }

  onData(listener: (chunk: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  disconnect(): void {
    this.alive = false;
    void ObdClassicBluetooth.disconnect().catch(() => undefined);
    for (const u of this.unsub) void u();
    this.unsub = [];
    this.dataListeners.clear();
    this.disconnectListeners.clear();
  }
}

/** Sort bonded + discovered: OBD-looking names first, then by RSSI. */
export function rankClassicDevices(devices: ClassicScanDevice[]): ClassicScanDevice[] {
  return [...devices].sort((a, b) => {
    const aObd = nameLooksLikeObdAdapter(a.name) ? 1 : 0;
    const bObd = nameLooksLikeObdAdapter(b.name) ? 1 : 0;
    if (aObd !== bObd) return bObd - aObd;
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });
}
