/**
 * Capacitor bridge for Android Classic RFCOMM/SPP (ObdClassicBluetoothPlugin).
 * No-ops / rejects on web and iOS — callers must gate with isNativeAndroid().
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type ObdClassicDevice = {
  address: string;
  name: string;
  rssi?: number;
};

type ObdClassicBluetoothPlugin = {
  isAvailable(): Promise<{ available: boolean; enabled: boolean }>;
  listBonded(): Promise<{ devices: ObdClassicDevice[] }>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(options: { address: string; insecure?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  write(options: { data: string }): Promise<void>;
  addListener(
    eventName: "data" | "disconnect" | "deviceFound" | "discoveryFinished",
    listenerFunc: (event: { data?: string; address?: string; name?: string; rssi?: number }) => void,
  ): Promise<PluginListenerHandle>;
};

const ObdClassicBluetooth = registerPlugin<ObdClassicBluetoothPlugin>(
  "ObdClassicBluetooth",
  {
    web: () => ({
      async isAvailable() {
        return { available: false, enabled: false };
      },
      async listBonded() {
        return { devices: [] };
      },
      async startDiscovery() {
        throw new Error("Classic Bluetooth is only available in the Android app.");
      },
      async stopDiscovery() {},
      async connect() {
        throw new Error("Classic Bluetooth is only available in the Android app.");
      },
      async disconnect() {},
      async write() {
        throw new Error("Classic Bluetooth is only available in the Android app.");
      },
      async addListener() {
        return { remove: async () => undefined };
      },
    }),
  },
);

export function isObdClassicPluginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export { ObdClassicBluetooth };
