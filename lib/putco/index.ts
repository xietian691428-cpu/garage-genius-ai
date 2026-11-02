export {
  PUTCO_CACHE_MS,
  PUTCO_FITMENT_URL,
  PUTCO_TIMEOUT_MS,
  fetchPutcoFitment,
  normalizePutcoProduct,
  parsePutcoFitmentPayload,
} from "@/lib/putco/client";
export {
  PUTCO_SOURCE_LINE,
  formatPutcoFitmentBlock,
} from "@/lib/putco/format";
export {
  putcoCountryForMarket,
  shouldQueryPutco,
} from "@/lib/putco/should-query";
export type {
  FetchPutcoFitmentInput,
  PutcoCountry,
  PutcoFitmentOk,
  PutcoFitmentResult,
  PutcoFitmentSkip,
  PutcoProductBrief,
} from "@/lib/putco/types";
