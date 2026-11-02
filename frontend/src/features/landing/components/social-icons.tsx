// Line icons for social profiles, drawn to match lucide's 24px grid and stroke
// (lucide 1.x no longer ships brand marks).

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** X (formerly Twitter). */
export function XIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </svg>
  );
}

/** LinkedIn: "in" inside a rounded square. */
export function LinkedInIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10.5V16" />
      <path d="M8 7.6v.01" />
      <path d="M12 16v-3.2a2.3 2.3 0 0 1 4.6 0V16" />
      <path d="M12 10.5V16" />
    </svg>
  );
}
