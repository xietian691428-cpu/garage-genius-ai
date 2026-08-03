/** Fixed fixtures for E2E — never use production customer data. */

export const FIXTURE = {
  vehicle: {
    nickname: `E2E Test Car ${Date.now().toString(36).slice(-4)}`,
    make: "Toyota",
    model: "Camry",
    engine: "2.5L I4",
    mileage: "87500",
    plate: "E2E-TEST",
    /** Fake but valid-length VIN for masking checks */
    vin: "1HGBH41JXMN109186",
  },
  dtc: "P0420",
  symptom:
    "Check engine light on with rough idle after warm-up, especially at stoplights.",
} as const;

export function vinLast8(vin: string): string {
  return vin.trim().toUpperCase().slice(-8);
}
