# Bluetooth OBD-II

Garage Genius talks to **ELM327-compatible** adapters (the open command set used by nearly every third-party OBD dongle) from **Chat**, **Check Engine coach**, and **Dashboard**. One scan reads the check engine light, stored / pending / permanent codes, emissions readiness, freeze frame, live sensors, odometer, and VIN, then can inject a diagnosis prompt into Chat.

### Clear fault codes (Mode 04)

After a successful scan and the liability notice, users may **Clear fault codes** behind an explicit risk gate (checkbox). This sends SAE J1979 **Mode 04**, which clears stored codes and resets readiness monitors. Permanent (Mode 0A) codes are not cleared by the standard. Copy warns that clearing does not fix the car, resets smog readiness, and must not be used to improperly pass an emissions / inspection test.

> **No demo / fake data** is ever written. Unsupported reads stay empty; without Bluetooth the user enters codes or uploads a scanner screenshot.

## Architecture

| Layer | File | Notes |
|---|---|---|
| Transport | `lib/obd-transport.ts`, `lib/obd-transport-native.ts`, `lib/obd-transport-classic.ts` | `ObdTransport` byte pipe. Web: `WebBluetoothTransport`. Store BLE: `NativeBleTransport`. Android Classic RFCOMM/SPP: `NativeClassicTransport` + `ObdClassicBluetoothPlugin`. |
| ELM session | `lib/obd-elm.ts` | One command in flight, waits for `>` prompt, init (`ATZ`…`ATSP*`), optional manual protocol (`1`–`C`), protocol search with 15 s timeout + one retry, supported-PID bitmaps, scan steps. |
| Protocol | `lib/obd-protocol.ts` | Pure parsing (unchanged for M2). |
| Connector | `lib/obd.ts` | `getObdConnector()` — BLE / Classic / Web factory; mid-session reconnect 1–2×; live sensor retry. |
| Self-check | `lib/obd-self-check.ts` | ATI + protocol + `0100` → shareable support report. |
| UI | `components/obd/ObdConnectModal.tsx` | Dual-mode on **Android only** (BLE first, Classic optional). iOS stays BLE-only. |

## Runtime support

| Environment | M1 | M2 (this work) |
|---|---|---|
| iOS App | Native BLE | Same (no Classic UI) |
| Android App | Native BLE | BLE **+** Classic RFCOMM/SPP |
| Chrome / Edge | Web Bluetooth BLE | Unchanged (no Classic from web) |
| Safari / iPhone webpage | Manual / screenshot | Unchanged |

Detection: `isNativeBleRuntime()` / `isNativeClassicRuntime()` / `isNativeAndroid()`.

## Adapters

**Works (BLE — M1):** Veepeak OBDCheck BLE / BLE+, OBDLink CX, Vgate iCar Pro BLE / vLinker BLE, generic ELM327 Bluetooth 4.0 / BLE (e.g. IOS-Vlink).

**Works (Classic — M2, Android only):** ELM327 SPP / “Bluetooth 2.0/3.0” dongles that pair as Classic serial (OBDLink LX / MX+ Classic, many $10–20 v1.5 clones, BAFX classic). Prefer pairing in Android Settings first, then Connect OBD → Classic.

**Won't work:** BlueDriver, FIXD, Carly, Carista, Innova RepairSolutions, Autel / Launch handhelds; Wi-Fi adapters (not in M2).

Cheap clones vary — we do **not** promise 100% compatibility. Use **Run self-check** to copy ATI / protocol / 0100 for support.

## Dual-mode UX (Android)

1. Default **Bluetooth LE** (M1 path unchanged).  
2. If BLE fails with no OBD GATT service, or the dongle is Classic-only → user taps **Classic Bluetooth**.  
3. Optional **Vehicle protocol** (ATSP): Automatic, or common CAN / ISO presets, or full 1–C list.  
4. **Self-check** per device: ATI + ATDPN + 0100 → copyable report.

## Mid-session resilience

- Scan / live refresh: on `disconnected`, reconnect the last adapter up to **2** times, then re-run.  
- Does not rewrite `obd-protocol` decoding.

## Permissions

- **iOS:** Bluetooth Always / Peripheral (BLE).  
- **Android 12+:** `BLUETOOTH_SCAN` (`neverForLocation`) + `BLUETOOTH_CONNECT` (BLE + Classic).  
- **Android ≤11:** legacy BT + location for discovery (`maxSdkVersion 30`).

## Tests

- `tests/obd-protocol.test.ts`, `tests/obd-session.test.ts`, `tests/obd-native-filter.test.ts`  
- `tests/obd-m2-classic.test.ts` — protocol choices, self-check report shape, Android-only classic gating helpers  
- Mode 04 clear ack helpers + `clearFaultCodes` session test in protocol/session suites  

## QA simulator

Unchanged — internal QA email / `NEXT_PUBLIC_OBD_SIM=1` only.

## Hardware checklist

### M1 BLE (regression — must stay green)

1. iOS + Veepeak/Vgate/IOS-Vlink BLE → Scan → codes / readiness / live → Chat  
2. Android BLE — same path  
3. Ignition OFF → clear `no_ecu` copy  
4. Another OBD app holding the link → retry after close  

### M2 Classic (Android)

1. Pair a Classic ELM327 in Android Bluetooth settings  
2. App → Connect OBD → **Classic Bluetooth** → select adapter → read codes / readiness → Chat  
3. Self-check → Copy report (ATI / protocol / 0100 OK)  
4. Auto protocol fails → pick CAN 11/500 (ATSP6) → reconnect succeeds on a modern car  
5. Mid-scan unplug briefly → auto-reconnect ≤2× or clear disconnect message  
6. Confirm **iOS has no Classic tab**  

### Suggested Classic hardware for QA

| Adapter | Notes |
|---|---|
| OBDLink LX / MX+ (Classic) | Reliable SPP reference |
| BAFX Products Bluetooth OBDII | Common Classic-only |
| Generic ELM327 v1.5 “Bluetooth” (not 4.0/BLE) | Cheap; quality varies — run self-check |
| Vgate iCar Pro **Bluetooth** (non-BLE SKU) | If labeled Classic / 3.0 |

Keep at least one known-good BLE dongle (IOS-Vlink / Veepeak) for M1 regression on the same Android phone.

## Store versions

M2 requires an **Android binary** that includes `ObdClassicBluetoothPlugin` (web alone is not enough for Classic). This branch bumps Play to **versionCode 13** (`1.0.3`). iOS can stay on BLE-only until an unrelated iOS release. Deploy web so Cap remote URL serves the dual-mode modal.
