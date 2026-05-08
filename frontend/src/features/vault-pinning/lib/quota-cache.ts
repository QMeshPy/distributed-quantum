import type { PinningService, QuotaInfo } from "../types";

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: QuotaInfo;
  fetchedAt: number;
}

const cache = new Map<PinningService, CacheEntry>();

export function getCachedQuota(service: PinningService): QuotaInfo | null {
  const entry = cache.get(service);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL) {
    cache.delete(service);
    return null;
  }
  return entry.data;
}

export function setCachedQuota(service: PinningService, data: QuotaInfo): void {
  cache.set(service, { data, fetchedAt: Date.now() });
}

export function invalidateQuotaCache(service: PinningService): void {
  cache.delete(service);
}
