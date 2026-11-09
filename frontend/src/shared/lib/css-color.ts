const cache = new Map<string, string>();

/** Resolves an Arc token (for example "--success") to a literal color, for canvas and WebGL code that cannot read CSS variables. Client only. */
export function resolveColor(token: string, alpha = 1): string {
  if (typeof document === "undefined") return "transparent";
  const root = document.documentElement;
  const key = `${root.dataset.theme ?? ""}|${token}|${alpha}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "transparent";
  ctx.fillStyle = getComputedStyle(root).getPropertyValue(token).trim() || "transparent";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const out = alpha >= 1 && a === 255
    ? `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
    : `rgba(${r}, ${g}, ${b}, ${+((a / 255) * alpha).toFixed(3)})`;
  cache.set(key, out);
  return out;
}
