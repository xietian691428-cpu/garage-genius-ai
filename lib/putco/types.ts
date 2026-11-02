/** Putco AI Fitment — read-only brand catalog (not OEM factory data). */

export type PutcoCountry = "us" | "ca";

export type PutcoProductBrief = {
  sku: string;
  title: string;
  price?: string | null;
  url?: string | null;
  category?: string | null;
  shortDescription?: string | null;
};

export type PutcoFitmentOk = {
  ok: true;
  year: number;
  make: string;
  model: string;
  country: PutcoCountry;
  products: PutcoProductBrief[];
  /** True when served from in-process TTL cache. */
  fromCache: boolean;
  fetchedAt: string;
};

export type PutcoFitmentSkip = {
  ok: false;
  reason:
    | "not_applicable"
    | "eu_uk_catalog"
    | "missing_ymm"
    | "timeout"
    | "http"
    | "parse"
    | "empty";
  detail?: string;
  /** When market is EU/GB/AU — explain US/CA catalog only without claiming ECE legality. */
  usCatalogOnlyNote?: boolean;
};

export type PutcoFitmentResult = PutcoFitmentOk | PutcoFitmentSkip;

export type FetchPutcoFitmentInput = {
  year: number;
  make: string;
  model: string;
  country?: PutcoCountry;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Skip cache read/write (tests). */
  bypassCache?: boolean;
};
