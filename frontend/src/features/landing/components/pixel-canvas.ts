/** Shared plumbing for the hero band's pixel canvases. */

export const TONES = [
  "--sea-abyss",
  "--sea-deep",
  "--sea-mid",
  "--sea-lift",
  "--sea-light",
  "--sea-core",
  "--sea-coral",
  "--sea-ink",
] as const;
export type Tone = (typeof TONES)[number];

export const hash = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function readTones(element: Element): Record<Tone, string> {
  const style = getComputedStyle(element);
  return Object.fromEntries(
    TONES.map((name) => [name, style.getPropertyValue(name).trim()]),
  ) as Record<Tone, string>;
}

export interface Grid {
  width: number;
  height: number;
  cell: number;
  cols: number;
  rows: number;
  ratio: number;
}

export function sizeCanvas(canvas: HTMLCanvasElement): Grid {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const cell = width < 640 ? 8 : 10;
  return { width, height, cell, cols: Math.ceil(width / cell), rows: Math.ceil(height / cell), ratio };
}

/** Paints a cell buffer as square pixels with a 1px gutter. */
export function paint(
  context: CanvasRenderingContext2D,
  grid: Grid,
  cells: ReadonlyArray<Tone | undefined>,
  colors: Record<Tone, string>,
) {
  context.setTransform(grid.ratio, 0, 0, grid.ratio, 0, 0);
  context.clearRect(0, 0, grid.width, grid.height);
  const gap = grid.cell - 1;
  for (let index = 0; index < cells.length; index += 1) {
    const tone = cells[index];
    if (!tone) continue;
    context.fillStyle = colors[tone];
    context.fillRect((index % grid.cols) * grid.cell, Math.floor(index / grid.cols) * grid.cell, gap, gap);
  }
}

/**
 * Runs `frame(t)` at a capped rate while the canvas is visible; with reduced
 * motion it draws one still frame. Returns a cleanup function.
 */
export function animate(
  canvas: HTMLCanvasElement,
  frame: (t: number) => void,
  onResize: () => void,
  fps = 24,
): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  let raf = 0;
  let previous = 0;
  let visible = true;
  const loop = (ms: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || ms - previous < 1000 / fps) return;
    previous = ms;
    frame((ms - start) / 1000);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  observer.observe(canvas);
  const resize = new ResizeObserver(() => {
    onResize();
    frame(reduce ? 6 : (performance.now() - start) / 1000);
  });
  resize.observe(canvas);
  if (reduce) frame(6);
  else raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    resize.disconnect();
  };
}
