import { VehicleDataError, type FetchLike } from "@/lib/vehicle-data/types";
import {
  NHTSA_USER_AGENT,
  isVehicleDataDebug,
  vehicleDataTimeoutMs,
} from "@/lib/vehicle-data/config";

export function vehicleDataLog(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  if (!isVehicleDataDebug()) return;
  console.log("[vehicle-data]", event, meta);
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  options?: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    fetchImpl?: FetchLike;
    accept?: string;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? vehicleDataTimeoutMs();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: options?.accept ?? "application/json",
        "User-Agent": NHTSA_USER_AGENT,
        ...options?.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new VehicleDataError(
        `HTTP ${response.status}`,
        "http",
        response.status,
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new VehicleDataError("Invalid JSON from upstream", "parse");
    }
  } catch (err) {
    if (err instanceof VehicleDataError) throw err;
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "AbortError" || /aborted|timeout/i.test(message)) {
      throw new VehicleDataError(
        `Request timed out after ${timeoutMs}ms`,
        "timeout",
      );
    }
    throw new VehicleDataError(message || "Upstream fetch failed", "http");
  } finally {
    clearTimeout(timer);
  }
}
