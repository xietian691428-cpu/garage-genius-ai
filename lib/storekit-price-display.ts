/**
 * Map StoreKit products to display strings for pricing UI.
 */

export type StoreKitPriceRow = {
  identifier?: string;
  priceString?: string;
};

export function storeKitPriceByProductId(
  products: StoreKitPriceRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of products) {
    const id = p.identifier?.trim();
    const price = p.priceString?.trim();
    if (id && price) out[id] = price;
  }
  return out;
}

export function displayIapPrice(input: {
  productId: string;
  storeKitPrices: Record<string, string>;
  loaded: boolean;
  fallbackUsd: number;
}): { label: string; fromStoreKit: boolean } {
  const sk = input.storeKitPrices[input.productId];
  if (sk) return { label: sk, fromStoreKit: true };
  if (!input.loaded) return { label: "…", fromStoreKit: false };
  const n = input.fallbackUsd;
  const usd = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
  return { label: `$${usd}`, fromStoreKit: false };
}
