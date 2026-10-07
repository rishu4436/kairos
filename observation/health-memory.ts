/** Process-local timestamp of the last successful live snapshot. Not a watchlist. */
let lastSuccessAt: string | null = null;

export function noteLiveSuccess(iso: string): void {
  lastSuccessAt = iso;
}

export function readLastSuccess(): string | null {
  return lastSuccessAt;
}

export function resetLastSuccess(): void {
  lastSuccessAt = null;
}
