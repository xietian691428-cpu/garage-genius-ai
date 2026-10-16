/**
 * Native BLE transport for Capacitor iOS / Android store shells.
 * Uses `@capacitor-community/bluetooth-le` and the same GATT service table as
 * Web Bluetooth. Protocol / ELM session code stays transport-agnostic.
 */

import {
  BleClient,
  dataViewToText,
  type ScanResult,
} from "@capacitor-community/bluetooth-le";
import { isNativeCapacitor } from "@/lib/native-platform";
import {
  BLE_OBD_SERVICES,
  nameLooksLikeObdAdapter,
  type ObdTransport,
} from "@/lib/obd-transport";

export type NativeBleScanDevice = {
  deviceId: string;
  name: string;
  rssi?: number;
};

const BLE_CHUNK = 20;

let initPromise: Promise<void> | null = null;
let scanning = false;

export function isNativeBleRuntime(): boolean {
  return isNativeCapacitor();
}

export async function ensureNativeBleReady(): Promise<void> {
  if (!isNativeBleRuntime()) {
    throw new Error("Native Bluetooth LE is only available in the store app.");
  }
  if (!initPromise) {
    initPromise = BleClient.initialize({ androidNeverForLocation: true }).catch(
      (err) => {
        initPromise = null;
        throw err;
      },
    );
  }
  await initPromise;
  if (!(await BleClient.isEnabled())) {
    try {
      await BleClient.requestEnable();
    } catch {
      throw new Error(
        "Bluetooth is off. Turn on Bluetooth in system settings and try again.",
      );
    }
  }
}

function scanName(result: ScanResult): string {
  return (result.localName || result.device.name || "").trim();
}

function uuidsLookLikeObd(uuids: string[] | undefined): boolean {
  if (!uuids?.length) return false;
  const set = new Set(uuids.map((u) => u.toLowerCase()));
  return BLE_OBD_SERVICES.some((s) => set.has(s.toLowerCase()));
}

/**
 * Start a BLE scan. Call `stopNativeBleScan` when done.
 * Default filter: OBD-like name prefixes or known OBD service UUIDs in the ad.
 * `showAllDevices` lists every named (or OBD-service) peripheral.
 */
export async function startNativeBleScan(
  onDevice: (device: NativeBleScanDevice) => void,
  options: { showAllDevices?: boolean } = {},
): Promise<void> {
  await ensureNativeBleReady();
  if (scanning) {
    await stopNativeBleScan();
  }
  scanning = true;
  const seen = new Set<string>();
  await BleClient.requestLEScan(
    {
      allowDuplicates: false,
      allowExtendedAdvertising: true,
    },
    (result) => {
      const deviceId = result.device.deviceId;
      if (!deviceId || seen.has(deviceId)) return;
      const name = scanName(result);
      if (!options.showAllDevices) {
        if (!nameLooksLikeObdAdapter(name) && !uuidsLookLikeObd(result.uuids)) {
          return;
        }
      } else if (!name && !uuidsLookLikeObd(result.uuids)) {
        return;
      }
      seen.add(deviceId);
      onDevice({
        deviceId,
        name: name || "OBD adapter",
        rssi: result.rssi,
      });
    },
  );
}

export async function stopNativeBleScan(): Promise<void> {
  if (!scanning) return;
  scanning = false;
  try {
    await BleClient.stopLEScan();
  } catch {
    /* already stopped */
  }
}

export class NativeBleTransport implements ObdTransport {
  readonly kind = "native-ble" as const;
  private dataListeners = new Set<(chunk: string) => void>();
  private disconnectListeners = new Set<() => void>();
  private alive = true;
  private readonly encoder = new TextEncoder();

  private constructor(
    private readonly deviceId: string,
    private readonly name: string,
    private readonly serviceUuid: string,
    private readonly writeUuid: string,
    private readonly notifyUuid: string,
    private readonly writeWithoutResponse: boolean,
  ) {}

  get deviceName(): string {
    return this.name;
  }

  get connected(): boolean {
    return this.alive;
  }

  /** Called from the BleClient disconnect callback. */
  private markDisconnected(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const l of this.disconnectListeners) l();
  }

  static async connect(options: {
    deviceId: string;
    deviceName?: string;
    timeoutMs?: number;
  }): Promise<NativeBleTransport> {
    await ensureNativeBleReady();
    await stopNativeBleScan();

    const deviceId = options.deviceId;
    const timeoutMs = options.timeoutMs ?? 20_000;
    let transport: NativeBleTransport | null = null;

    await BleClient.connect(
      deviceId,
      () => {
        transport?.markDisconnected();
      },
      { timeout: timeoutMs },
    );

    try {
      await BleClient.discoverServices(deviceId).catch(() => undefined);
      const services = await BleClient.getServices(deviceId);

      for (const service of services) {
        const svc = service.uuid.toLowerCase();
        if (!BLE_OBD_SERVICES.some((s) => s.toLowerCase() === svc)) continue;

        const writeChar = service.characteristics.find(
          (c) => c.properties.write || c.properties.writeWithoutResponse,
        );
        const notifyChar = service.characteristics.find(
          (c) => c.properties.notify || c.properties.indicate,
        );
        if (!writeChar || !notifyChar) continue;

        transport = new NativeBleTransport(
          deviceId,
          options.deviceName || "OBD adapter",
          service.uuid,
          writeChar.uuid,
          notifyChar.uuid,
          writeChar.properties.writeWithoutResponse,
        );

        await BleClient.startNotifications(
          deviceId,
          service.uuid,
          notifyChar.uuid,
          (value) => {
            const text = dataViewToText(value);
            if (!text || !transport) return;
            for (const l of transport.dataListeners) l(text);
          },
        );

        return transport;
      }

      await BleClient.disconnect(deviceId).catch(() => undefined);
      throw new Error("No compatible OBD BLE service/characteristic found");
    } catch (err) {
      await BleClient.disconnect(deviceId).catch(() => undefined);
      throw err;
    }
  }

  async write(text: string): Promise<void> {
    if (!this.alive) throw new Error("OBD adapter disconnected");
    const bytes = this.encoder.encode(text);
    for (let i = 0; i < bytes.length; i += BLE_CHUNK) {
      const chunk = bytes.slice(i, i + BLE_CHUNK);
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      if (this.writeWithoutResponse) {
        await BleClient.writeWithoutResponse(
          this.deviceId,
          this.serviceUuid,
          this.writeUuid,
          view,
        );
      } else {
        await BleClient.write(
          this.deviceId,
          this.serviceUuid,
          this.writeUuid,
          view,
        );
      }
    }
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
    void BleClient.stopNotifications(
      this.deviceId,
      this.serviceUuid,
      this.notifyUuid,
    ).catch(() => undefined);
    void BleClient.disconnect(this.deviceId).catch(() => undefined);
  }
}
