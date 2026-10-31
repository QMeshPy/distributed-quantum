const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** Scroll supplies both the reading holds and the reversible plate handoffs. */
export function architectureFrame(progress: number, count: number) {
  const cursor = clamp((progress - 0.18) / 0.76) * count;
  const step = Math.min(count - 1, Math.floor(cursor));
  const position = Math.min(count - 1, step + smooth((cursor - step - 0.6) / 0.4));
  const intro = progress < 0.18;
  const active = intro ? -1 : Math.round(position);
  return {
    intro,
    position,
    active,
    blend: smooth((progress - 0.05) / 0.13),
    focus: intro ? 0 : 1 - Math.abs(position - active),
  };
}
