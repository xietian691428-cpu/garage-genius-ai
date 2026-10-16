/**
 * Byte-pipe to an ELM327-compatible adapter. The ELM session in
 * `lib/obd-elm.ts` only talks to this interface, so native BLE, Classic
 * Bluetooth (Android) and Wi-Fi adapters can be added without touching the
 * protocol code.
 */

export type ObdTransportKind = "web-bluetooth" | "native-ble" | "mock";

export interface ObdTransport {
  readonly kind: ObdTransportKind;
  readonly deviceName: string;
  readonly connected: boolean;
  write(text: string): Promise<void>;
  /** Returns an unsubscribe function. */
  onData(listener: (chunk: string) => void): () => void;
  onDisconnect(listener: () => void): () => void;
  disconnect(): void;
}

// ── Web Bluetooth (Chrome / Edge on Android and desktop) ─────────

type GattCharacteristic = {
  uuid: string;
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
  };
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<GattCharacteristic>;
  addEventListener: (type: string, listener: (ev: Event) => void) => void;
  value?: DataView | null;
};

type GattService = {
  uuid: string;
  getCharacteristics: () => Promise<GattCharacteristic[]>;
};

type GattServer = {
  connected: boolean;
  connect: () => Promise<GattServer>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<GattService>;
};

type BluetoothDeviceLike = {
  name?: string;
  gatt?: GattServer | null;
  addEventListener?: (type: string, listener: () => void) => void;
};

type RequestDeviceOptions =
  | {
      filters: Array<{ namePrefix?: string; services?: string[] }>;
      optionalServices?: string[];
    }
  | { acceptAllDevices: true; optionalServices?: string[] };

type WebBluetooth = {
  requestDevice: (options: RequestDeviceOptions) => Promise<BluetoothDeviceLike>;
};

const uuid16 = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

/**
 * Serial-over-GATT services used by ELM327-compatible BLE adapters sold in
 * the US. Characteristics are discovered by property, so unknown char UUIDs
 * inside these services still work.
 */
export const BLE_OBD_SERVICES: string[] = [
  uuid16("fff0"), // Veepeak, Konnwei, many ELM327 BLE
  uuid16("ffe0"), // HM-10 based clones
  uuid16("18f0"), // "IOS-Vlink" / generic ELM327 BLE
  uuid16("ae30"), // budget "Bluetooth 4.0" dongles
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Vgate iCar / vLinker
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
];

/** Web Bluetooth `namePrefix` is case-sensitive — list common spellings. */
export const OBD_BLE_NAME_PREFIXES = [
  "OBD",
  "Obd",
  "obd",
  "ELM",
  "Elm",
  "VEEPEAK",
  "Veepeak",
  "OBDLink",
  "OBDLINK",
  "IOS-Vlink",
  "Android-Vlink",
  "V-LINK",
  "vLinker",
  "VLINK",
  "Vgate",
  "iCar",
  "KONNWEI",
  "Konnwei",
  "Viecar",
  "LELink",
  "Kiwi",
  "BLE",
];

/** Case-insensitive name match for native scan filtering. */
export function nameLooksLikeObdAdapter(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  return OBD_BLE_NAME_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}

function getWebBluetooth(): WebBluetooth | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { bluetooth?: WebBluetooth };
  return typeof nav.bluetooth?.requestDevice === "function"
    ? nav.bluetooth
    : null;
}

export function isWebBluetoothAvailable(): boolean {
  return getWebBluetooth() != null;
}

const BLE_CHUNK = 20;

export class WebBluetoothTransport implements ObdTransport {
  readonly kind = "web-bluetooth" as const;
  private dataListeners = new Set<(chunk: string) => void>();
  private disconnectListeners = new Set<() => void>();
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  private constructor(
    private device: BluetoothDeviceLike,
    private server: GattServer,
    private writeChar: GattCharacteristic,
  ) {
    device.addEventListener?.("gattserverdisconnected", () => {
      for (const l of this.disconnectListeners) l();
    });
  }

  get deviceName(): string {
    return this.device.name || "OBD adapter";
  }

  get connected(): boolean {
    return this.server.connected;
  }

  /**
   * Opens the browser device picker, connects GATT, and finds a serial
   * service. `showAllDevices` lists every nearby BLE device for adapters with
   * unusual names.
   */
  static async request(options: {
    showAllDevices?: boolean;
    timeoutMs?: number;
  } = {}): Promise<WebBluetoothTransport> {
    const bluetooth = getWebBluetooth();
    if (!bluetooth) throw new Error("Web Bluetooth unavailable");

    const device = await bluetooth.requestDevice(
      options.showAllDevices
        ? { acceptAllDevices: true, optionalServices: BLE_OBD_SERVICES }
        : {
            filters: [
              ...OBD_BLE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
              ...BLE_OBD_SERVICES.map((s) => ({ services: [s] })),
            ],
            optionalServices: BLE_OBD_SERVICES,
          },
    );
    if (!device.gatt) throw new Error("Selected device has no GATT server");

    const timeoutMs = options.timeoutMs ?? 20_000;
    const server = await Promise.race([
      device.gatt.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GATT connect timeout")), timeoutMs),
      ),
    ]);

    for (const serviceUuid of BLE_OBD_SERVICES) {
      let chars: GattCharacteristic[];
      try {
        const service = await server.getPrimaryService(serviceUuid);
        chars = await service.getCharacteristics();
      } catch {
        continue;
      }
      const writeChar = chars.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse,
      );
      const notifyChar = chars.find(
        (c) => c.properties.notify || c.properties.indicate,
      );
      if (!writeChar || !notifyChar) continue;

      const transport = new WebBluetoothTransport(device, server, writeChar);
      await notifyChar.startNotifications();
      notifyChar.addEventListener("characteristicvaluechanged", (ev) => {
        const value = (ev.target as GattCharacteristic | null)?.value;
        if (!value) return;
        const text = transport.decoder.decode(value, { stream: true });
        for (const l of transport.dataListeners) l(text);
      });
      return transport;
    }

    try {
      server.disconnect();
    } catch {
      /* ignore */
    }
    throw new Error("No compatible OBD BLE service/characteristic found");
  }

  async write(text: string): Promise<void> {
    const bytes = this.encoder.encode(text);
    const c = this.writeChar;
    for (let i = 0; i < bytes.length; i += BLE_CHUNK) {
      const chunk = bytes.slice(i, i + BLE_CHUNK);
      if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
        await c.writeValueWithoutResponse(chunk);
      } else if (c.writeValueWithResponse) {
        await c.writeValueWithResponse(chunk);
      } else if (c.writeValue) {
        await c.writeValue(chunk);
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
    try {
      this.server.disconnect();
    } catch {
      /* ignore */
    }
  }
}
