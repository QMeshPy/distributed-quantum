export function estimateSize(data: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}
