# Bluetooth OBD-II (Web Bluetooth)

Garage Genius can connect to **BLE** ELM327-compatible adapters from Chat and the Check Engine coach guide, read DTCs (+ basic live sensors), and inject a diagnosis prompt into Chat.

## Runtime support

| Environment | Support |
|---|---|
| Chrome / Edge on **Android** | Best path — Web Bluetooth + BLE ELM327 |
| Chrome / Edge on **desktop** (Windows/macOS/Linux) | Supported when the OS exposes BLE |
| Safari / iOS WKWebView / Capacitor **iOS** | **Not supported** — use Enter fault code or OBD screenshot |
| Capacitor **Android** | Works when the WebView exposes `navigator.bluetooth` (Chrome-based) |
| Classic Bluetooth (non-BLE) dongles | **Not supported** in browsers |

Detection helpers live in `lib/obd.ts`: `getObdRuntimeSupport()`, `isCapacitorNative()`, `getCapacitorPlatform()`.

## Compatible devices (tested class)

Listed in-app and in `OBD_COMPATIBLE_DEVICES` (`lib/types/obd-session.ts`):

- **Veepeak OBDCheck BLE / Mini** — Nordic UART; reliable DIY pick
- **OBDLink MX+ / CX** (BLE mode)
- **Generic ELM327 BLE** clones (names often `OBD` / `ELM` / `BLE`) — quality varies
- **Carista**-class BLE dongles when they expose a GATT serial service

We try common GATT UART UUID pairs (Nordic UART, FFF0, FFE0, 18F0).

## What we read (v1)

1. **DTCs** — Mode `03` (stored) + `07` (pending)
2. **Live sensors** (best-effort Mode `01`): coolant, RPM, speed, throttle, voltage, oil temp
3. **Mileage hints** (often unsupported): PID `A6` odometer km, PID `31` distance since codes cleared

Structured result: `ObdSessionSnapshot` → `buildObdBleDiagnosisPrompt()` → Chat.

## UX entry points

- Chat composer: **Connect OBD** (`DtcEntryBar` + `ObdConnectModal`)
- Check Engine playbook chrome (outside `CoachScenarioPlayer`): same bar
- Dashboard already has a separate OBD Diagnose path using the same `getObdConnector()` singleton

## Connection tips for users

1. Adapter in OBD-II port, ignition ON  
2. Adapter LED on; phone within ~1 m  
3. Allow Bluetooth permission when prompted  
4. Prefer adapters advertised as **BLE / 4.0+**

## Limits / known gaps

- No manufacturer-enhanced modules (BMW/Porsche body codes may need a shop tool)
- No freeze-frame / Mode 02 yet
- PID support varies by ECU — nulls are expected
- iOS store builds should keep screenshot + manual code paths as primary until a native BLE plugin is added

## Code map

- `lib/obd.ts` — connector, parse, `connectDetailed`, `readSessionSnapshot`
- `lib/types/obd-session.ts` — snapshot + device list
- `components/obd/ObdConnectModal.tsx` — guide + connect UI
- `lib/dtc.ts` — `buildObdBleDiagnosisPrompt`
