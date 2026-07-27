# Bluetooth OBD-II (Web Bluetooth)

Garage Genius connects to **BLE ELM327-compatible** adapters from **Chat**, **Check Engine coach**, and **Dashboard**, reads DTCs (+ basic live sensors), and can inject a diagnosis prompt into Chat.

> **Hard requirement:** Currently only **BLE (Bluetooth Low Energy) ELM327** adapters are supported. **Classic Bluetooth is not supported in the browser.**  
> **No demo / fake DTC data** is written when Bluetooth is unavailable — use manual fault codes or OBD screenshot instead.

## Product stance (current phase)

| Priority | Platform |
|---|---|
| Primary | Chrome / Edge on **Android** + BLE ELM327 |
| Primary | Chrome / Edge on **desktop** + BLE ELM327 |
| Fallback | **iOS** — Bluetooth OBD **not supported**; use **Enter fault code** or **OBD screenshot** |
| Later | Native Capacitor BLE plugin for iOS store builds |

### Shared UI

All three surfaces use **`ObdConnectModal`** (`components/obd/ObdConnectModal.tsx`):

| Surface | On successful read | Primary result CTA |
|---|---|---|
| Chat / Check Engine | Auto-inject Chat diagnosis | Re-send diagnosis / close |
| Dashboard | Sync codes + sensors to vehicle vitals | **Ask AI** → Chat diagnosis (`onAskAi`) |

Modal stays open after read so the user can **Read again** or **Disconnect**.

## Runtime support

| Environment | Support |
|---|---|
| Chrome / Edge on **Android** | Best path — Web Bluetooth + BLE ELM327 |
| Chrome / Edge on **desktop** | Supported when the OS exposes BLE |
| Safari / iOS WKWebView / Capacitor **iOS** | **Not supported** — manual code or screenshot |
| Capacitor **Android** | Works when the WebView exposes `navigator.bluetooth` |
| Classic Bluetooth (non-BLE) dongles | **Not supported** |

Detection: `getObdRuntimeSupport()` in `lib/obd.ts`.

## Compatible devices (BLE ELM327 only)

`OBD_COMPATIBLE_DEVICES` in `lib/types/obd-session.ts`:

- Veepeak OBDCheck BLE / Mini  
- OBDLink MX+ / CX (**BLE mode**)  
- Generic ELM327 **BLE** clones  
- Carista-class BLE dongles  

## What we read (v1)

1. **DTCs** — Mode `03` + `07`  
2. **Live sensors** — coolant, RPM, speed, throttle, voltage, oil temp  
3. **Mileage hints** — PID `A6` / `31` when ECU supports them  

## Photo / screenshot quota

OBD **screenshots** (vision) count against the Free plan **daily photo diagnose** limit in:

- Chat (`ChatInput` → `ensurePhotoQuota`)  
- Check Engine coach (`CoachLibrary.runObdScreenshotToChat` → `recordPhotoDiagnose`)  

BLE connect itself does **not** consume photo quota.

## Canonical copy

- BLE-only: *“Currently only BLE (Bluetooth Low Energy) ELM327 adapters are supported. Classic Bluetooth is not supported in the browser.”*  
- iOS / no Web Bluetooth: *Use Enter fault code or upload an OBD screenshot.* Never invent demo codes.

## Local verification before production deploy

1. Chrome Android + real **BLE** ELM327  
2. Dashboard **Connect OBD** → vitals update → Ask AI → Chat  
3. Chat / Check Engine Connect OBD → diagnosis inject  
4. Unsupported browser: modal blocks; **no** fake P0171 on Dashboard  
5. Free user: Coach OBD screenshot hits photo upgrade when quota exhausted  
6. Then `vercel --prod`

## Code map

- `lib/obd.ts` — connector / `readSessionSnapshot`  
- `components/obd/ObdConnectModal.tsx` — shared guide + connect UI  
- `components/dashboard/Dashboard.tsx` — vitals sync + Ask AI  
- `components/chat/DtcEntryBar.tsx` — Chat / Coach entry  
- `lib/dtc.ts` — `buildObdBleDiagnosisPrompt`  
- i18n: `obd.*` / `dtc.*` in `locales/en-US` and `locales/es`
