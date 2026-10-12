# Bluetooth OBD-II

Garage Genius talks to **ELM327-compatible** adapters (the open command set used by nearly every third-party OBD dongle) from **Chat**, **Check Engine coach**, and **Dashboard**. One scan reads the check engine light, stored / pending / permanent codes, emissions readiness, freeze frame, live sensors, odometer, and VIN, then can inject a diagnosis prompt into Chat.

> **No demo / fake data** is ever written. Unsupported reads stay empty; without Bluetooth the user enters codes or uploads a scanner screenshot.

## Architecture

| Layer | File | Notes |
|---|---|---|
| Transport | `lib/obd-transport.ts` | `ObdTransport` byte pipe. Today: `WebBluetoothTransport`. Phase 2 adds native BLE (iOS + Android) and Classic Bluetooth (Android). |
| ELM session | `lib/obd-elm.ts` | One command in flight, waits for `>` prompt, init (`ATZ ATE0 ATL0 ATS1 ATH1 ATAT1 ATSP0`), protocol search with 15 s timeout + one retry, supported-PID bitmaps, scan steps. |
| Protocol | `lib/obd-protocol.ts` | Pure parsing: CAN 11/29-bit with ISO-TP reassembly, legacy J1850 / ISO 9141 / KWP (header + checksum), header-less fallback, multi-ECU. Decoders for DTCs, PIDs, readiness, VIN, freeze frame. |
| Connector | `lib/obd.ts` | `getObdConnector()` singleton → `ObdSessionSnapshot`. Transport factory is injectable (tests, Phase 2). |
| Units | `lib/obd-units.ts` | Data stays metric; UI shows °F / mph / miles unless the vehicle uses km. |
| VIN check | `app/api/obd/vin/route.ts` | Compares OBD VIN with the garage vehicle; saves only when the vehicle has none. |
| UI | `components/obd/ObdConnectModal.tsx` | Guide, step progress, results, VIN match / save. |

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

| Environment | Today |
|---|---|
| Chrome / Edge (Android phone, desktop) | Web Bluetooth + BLE adapters |
| Safari / iOS | Not available — manual code or screenshot |
| Store apps (iOS / Android WebView) | Not available until the native transport ships (Phase 2) |

Detection: `getObdRuntimeSupport()` in `lib/obd.ts`. iOS-visible copy must not mention other platforms (App Store 2.3.10, guarded by `tests/ios-review-fixes.test.ts`).

## Adapters

Works: Veepeak OBDCheck BLE / BLE+, OBDLink CX, Vgate iCar Pro BLE / vLinker BLE, generic ELM327 Bluetooth 4.0 / BLE. GATT services probed: `fff0`, `ffe0`, `18f0`, `ae30`, Vgate `e7810a71…`, Nordic UART; write / notify characteristics are found by property. “My adapter isn't listed” opens an unfiltered picker.

Won't work (closed ecosystems): BlueDriver, FIXD, Carly, Carista, Innova RepairSolutions, Autel / Launch handhelds.

Classic-Bluetooth-only (OBDLink LX / MX+, $10 ELM327 v1.5 classic, BAFX) and Wi-Fi adapters cannot connect from a browser — Phase 2.

## Tests

- `tests/obd-protocol.test.ts` — real response formats per protocol, multi-ECU, multi-frame, readiness, VIN, freeze frame  
- `tests/obd-session.test.ts` — scripted ELM327 (`FakeElm`): 2018 CAN car end-to-end, chunked BLE delivery, ISO 9141 car, header-less clones, search retry, ignition off, non-ELM device  

## Before release with real hardware

1. Chrome Android + one BLE adapter on a 2008+ car: codes / readiness / VIN match  
2. Same with a pre-2008 car if available (K-line / J1850)  
3. Ignition OFF → clear “turn the ignition ON” error  
4. Dashboard Connect OBD → vitals update → Ask AI → Chat  
5. Unsupported browser: modal blocks; no fake codes  
