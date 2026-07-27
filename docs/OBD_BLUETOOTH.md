# Bluetooth OBD-II (Web Bluetooth)

Garage Genius can connect to **BLE ELM327-compatible** adapters from Chat and the Check Engine coach guide, read DTCs (+ basic live sensors), and inject a diagnosis prompt into Chat.

> **Hard requirement:** Currently only **BLE (Bluetooth Low Energy) ELM327** adapters are supported. **Classic Bluetooth is not supported in the browser.**

## Product stance (current phase)

| Priority | Platform |
|---|---|
| Primary | Chrome / Edge on **Android** + BLE ELM327 |
| Primary | Chrome / Edge on **desktop** + BLE ELM327 |
| Fallback | **iOS** — Bluetooth OBD **not supported**; use **Enter fault code** or **OBD screenshot** |
| Later | Native Capacitor BLE plugin for iOS store builds |

After a successful read we **inject Chat diagnosis automatically** but **keep the connect sheet open** so the user can **Read again** or **Disconnect**.

## Runtime support

| Environment | Support |
|---|---|
| Chrome / Edge on **Android** | Best path — Web Bluetooth + BLE ELM327 |
| Chrome / Edge on **desktop** | Supported when the OS exposes BLE |
| Safari / iOS WKWebView / Capacitor **iOS** | **Not supported** — manual code or screenshot |
| Capacitor **Android** | Works when the WebView exposes `navigator.bluetooth` |
| Classic Bluetooth (non-BLE) dongles | **Not supported** |

Detection helpers: `getObdRuntimeSupport()`, `isCapacitorNative()`, `getCapacitorPlatform()` in `lib/obd.ts`.

## Compatible devices (BLE ELM327 only)

Listed in-app (`OBD_COMPATIBLE_DEVICES` in `lib/types/obd-session.ts`):

- **Veepeak OBDCheck BLE / Mini**
- **OBDLink MX+ / CX** (BLE mode)
- **Generic ELM327 BLE** clones (packaging must say BLE / 4.0+)
- **Carista**-class BLE dongles with GATT serial

We try common GATT UART UUID pairs (Nordic UART, FFF0, FFE0, 18F0).

## What we read (v1)

1. **DTCs** — Mode `03` (stored) + `07` (pending)
2. **Live sensors** (best-effort Mode `01`): coolant, RPM, speed, throttle, voltage, oil temp
3. **Mileage hints** (often unsupported): PID `A6` odometer km, PID `31` distance since codes cleared

Structured result: `ObdSessionSnapshot` → `buildObdBleDiagnosisPrompt()` → Chat.

## UX copy (canonical)

- BLE-only: *“Currently only BLE (Bluetooth Low Energy) ELM327 adapters are supported. Classic Bluetooth is not supported in the browser.”*
- iOS: *“iOS does not support Bluetooth OBD yet. Please use Enter fault code or upload an OBD screenshot.”*

## Local verification before production deploy

1. Chrome Android + real **BLE** ELM327  
2. Ignition ON → **Connect OBD** → picker → codes/sensors  
3. Confirm Chat diagnosis inject + modal stays open for Read again / Disconnect  
4. Confirm Classic / iOS paths show clear fallbacks  
5. Then `vercel --prod`

## Code map

- `lib/obd.ts` — connector, `connectDetailed`, `readSessionSnapshot`
- `lib/types/obd-session.ts` — snapshot + device list
- `components/obd/ObdConnectModal.tsx` — guide + connect UI
- `lib/dtc.ts` — `buildObdBleDiagnosisPrompt`
- i18n: `obd.*` in `locales/en-US` and `locales/es`
