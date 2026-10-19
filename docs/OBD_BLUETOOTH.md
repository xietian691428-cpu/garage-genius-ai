# Bluetooth OBD-II

Garage Genius talks to **ELM327-compatible** adapters (the open command set used by nearly every third-party OBD dongle) from **Chat**, **Check Engine coach**, and **Dashboard**. One scan reads the check engine light, stored / pending / permanent codes, emissions readiness, freeze frame, live sensors, odometer, and VIN, then can inject a diagnosis prompt into Chat.

> **No demo / fake data** is ever written. Unsupported reads stay empty; without Bluetooth the user enters codes or uploads a scanner screenshot.

## Architecture

| Layer | File | Notes |
|---|---|---|
| Transport | `lib/obd-transport.ts`, `lib/obd-transport-native.ts` | `ObdTransport` byte pipe. Web: `WebBluetoothTransport`. Store apps: `NativeBleTransport` via `@capacitor-community/bluetooth-le`. Classic Bluetooth (Android) is Phase 2 M2 — not shipped. |
| ELM session | `lib/obd-elm.ts` | One command in flight, waits for `>` prompt, init (`ATZ ATE0 ATL0 ATS1 ATH1 ATAT1 ATSP0`), protocol search with 15 s timeout + one retry, supported-PID bitmaps, scan steps. |
| Protocol | `lib/obd-protocol.ts` | Pure parsing: CAN 11/29-bit with ISO-TP reassembly, legacy J1850 / ISO 9141 / KWP (header + checksum), header-less fallback, multi-ECU. Decoders for DTCs, PIDs, readiness, VIN, freeze frame. |
| Connector | `lib/obd.ts` | `getObdConnector()` singleton → `ObdSessionSnapshot`. Picks Web vs native transport by platform. |
| Units | `lib/obd-units.ts` | Data stays metric; UI shows °F / mph / miles unless the vehicle uses km. |
| VIN check | `app/api/obd/vin/route.ts` | Compares OBD VIN with the garage vehicle; saves only when the vehicle has none. |
| UI | `components/obd/ObdConnectModal.tsx` | Guide, native scan list (store apps), step progress, results, VIN match / save. |

## What a scan reads

1. **PID 01** — check engine light (MIL), confirmed DTC count, readiness monitors (spark or diesel set)  
2. **Mode 03 / 07 / 0A** — stored, pending, permanent codes from every responding module  
3. **Mode 02** — freeze frame (when the light is on or a stored code exists)  
4. **Mode 01** — coolant, RPM, speed, throttle, module voltage, oil temp (only PIDs the car reports as supported), distance since codes cleared (31), odometer (A6, 0.1 km)  
5. **Mode 09 PID 02** — VIN; model year from VIN feeds the smog estimate  
6. **ATRV** — battery voltage at the OBD port  

**Smog estimate** (`evaluateSmogReadiness`): MIL on → fail; 2001+ allows 1 incomplete monitor, 1996–2000 allows 2 (EPA guidance). Always labeled as an estimate — states differ.

Codes are **read-only**. Clearing codes (Mode 04) is intentionally not offered: it resets readiness and can make a car fail inspection.

## Runtime support

| Environment | Today (M1) |
|---|---|
| iOS App (Capacitor) | Native BLE via `@capacitor-community/bluetooth-le` — in-app scan list |
| Android App (Capacitor) | Native BLE (same plugin) — in-app scan list; runtime SCAN/CONNECT |
| Chrome / Edge (desktop or Android browser) | Web Bluetooth + BLE adapters |
| Safari / iPhone webpage | Not available — use the App, or enter code / screenshot |

Detection: `getObdRuntimeSupport()` / `isNativeBleRuntime()` in `lib/obd.ts`. iOS-visible copy must not mention other platforms (App Store 2.3.10, guarded by `tests/ios-review-fixes.test.ts`).

## Adapters

**Works (open ELM327 BLE):** Veepeak OBDCheck BLE / BLE+, OBDLink CX, Vgate iCar Pro BLE / vLinker BLE, generic ELM327 Bluetooth 4.0 / BLE.

GATT services probed: `fff0`, `ffe0`, `18f0`, `ae30`, Vgate `e7810a71…`, Nordic UART; write / notify characteristics are found by property. “My adapter isn't listed” rescans without the OBD name filter (native) or opens an unfiltered picker (web).

**Won't work (closed ecosystems):** BlueDriver, FIXD, Carly, Carista, Innova RepairSolutions, Autel / Launch handhelds.

**Not yet (M2):** Classic-Bluetooth-only (OBDLink LX / MX+, many $10–20 ELM327 v1.5 classic, BAFX classic) and Wi-Fi adapters.

Cheap clones vary widely — we do **not** promise 100% compatibility.

## Permissions

- **iOS:** `NSBluetoothAlwaysUsageDescription` / `NSBluetoothPeripheralUsageDescription` — connect to OBD-II adapters to read diagnostic data.  
- **Android 12+:** `BLUETOOTH_SCAN` (`neverForLocation`) + `BLUETOOTH_CONNECT`; `BleClient.initialize({ androidNeverForLocation: true })`.  
- **Android ≤11:** legacy `BLUETOOTH` / `BLUETOOTH_ADMIN` + location (`maxSdkVersion 30`) for scanning.

## Tests

- `tests/obd-protocol.test.ts` — real response formats per protocol, multi-ECU, multi-frame, readiness, VIN, freeze frame  
- `tests/obd-session.test.ts` — scripted ELM327 (`FakeElm`): 2018 CAN car end-to-end, chunked BLE delivery, ISO 9141 car, header-less clones, search retry, ignition off, non-ELM device  
- `tests/obd-native-filter.test.ts` — OBD name-prefix filter for native scan  

## QA simulator (no hardware)

Internal smoke-test account (`lib/qa-test-account.ts`) sees a **QA — simulated adapters** list in Connect OBD. These use `lib/obd-sim.ts` (scripted ELM327) and never touch Bluetooth. Ordinary accounts never see them.

Scenarios: Camry with codes, no-codes/ready, ignition OFF, silent adapter, occupied link. Use this to exercise Scan → result → Chat without a dongle. **Real BLE still requires hardware** before claiming M1 hardware readiness.

Local/preview override: `NEXT_PUBLIC_OBD_SIM=1` (any signed-in user).

## Hardware checklist (M1 acceptance)

1. **iOS App** + Veepeak or Vgate BLE on a 2008+ car: Scan → connect → codes / readiness / VIN → Open diagnosis in Chat  
2. **Android App** — same path  
3. Ignition OFF → clear “turn the ignition ON” (`no_ecu`) error  
4. Close another OBD app holding the adapter → connect succeeds after retry  
5. Unsupported browser still blocks with Chrome / manual-code guidance; no fake codes  

## Store versions

M1 ships with **Android versionCode 12** (`1.0.2`) and **iOS build 12** (`1.0.2`). Deploy the matching web build so Cap remote URL serves the new modal.
