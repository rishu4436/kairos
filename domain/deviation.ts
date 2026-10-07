/**
 * Percent gap between the token price and the source reference price.
 * This is reference deviation. It is not an arbitrage profit.
 *
 * referenceDeviationPct = ((tokenPrice - referencePrice) / referencePrice) * 100
 */
export function referenceDeviationPct(tokenPrice: string, referencePrice: string): number | null {
  const token = Number(tokenPrice);
  const reference = Number(referencePrice);
  if (!Number.isFinite(token) || !Number.isFinite(reference) || reference === 0) {
    return null;
  }
  return ((token - reference) / reference) * 100;
}
