/**
 * Client helper for /api/vcdb cascade endpoints.
 */

import type { VcdbOptions, VcdbResolvedConfig, VcdbStatus } from "@/lib/types/vcdb";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `VCdb request failed (${res.status})`,
    );
  }
  return data;
}

export async function fetchVcdbStatus(): Promise<VcdbStatus> {
  return getJson<VcdbStatus>("/api/vcdb?action=status");
}

export async function fetchYears(): Promise<number[]> {
  const data = await getJson<{ years: number[] }>("/api/vcdb?action=years");
  return data.years;
}

export async function fetchMakes(year: number): Promise<string[]> {
  const data = await getJson<{ makes: string[] }>(
    `/api/vcdb?action=makes&year=${year}`,
  );
  return data.makes;
}

export async function fetchModels(year: number, make: string): Promise<string[]> {
  const data = await getJson<{ models: string[] }>(
    `/api/vcdb?action=models&year=${year}&make=${encodeURIComponent(make)}`,
  );
  return data.models;
}

export async function fetchSubmodels(
  year: number,
  make: string,
  model: string,
): Promise<string[]> {
  const data = await getJson<{ submodels: string[] }>(
    `/api/vcdb?action=submodels&year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
  );
  return data.submodels;
}

export async function fetchOptions(
  year: number,
  make: string,
  model: string,
  submodel?: string | null,
): Promise<VcdbOptions> {
  const qs = new URLSearchParams({
    action: "options",
    year: String(year),
    make,
    model,
  });
  if (submodel) qs.set("submodel", submodel);
  return getJson<VcdbOptions>(`/api/vcdb?${qs.toString()}`);
}

export async function resolveVcdbConfig(input: {
  year: number;
  make: string;
  model: string;
  submodel?: string | null;
  engine?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  brakes?: string | null;
}): Promise<VcdbResolvedConfig> {
  const qs = new URLSearchParams({
    action: "resolve",
    year: String(input.year),
    make: input.make,
    model: input.model,
  });
  if (input.submodel) qs.set("submodel", input.submodel);
  if (input.engine) qs.set("engine", input.engine);
  if (input.transmission) qs.set("transmission", input.transmission);
  if (input.driveType) qs.set("driveType", input.driveType);
  if (input.brakes) qs.set("brakes", input.brakes);

  const data = await getJson<{ config: VcdbResolvedConfig }>(
    `/api/vcdb?${qs.toString()}`,
  );
  return data.config;
}
