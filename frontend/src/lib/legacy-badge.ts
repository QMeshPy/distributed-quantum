import type { BadgeProps } from "@/components/arc/badge/badge";

type Legacy = "default" | "secondary" | "outline" | "destructive";

/** Maps the old shadcn Badge variant names onto Arc's tone/outline props. */
export function legacyBadge(v: Legacy): Pick<BadgeProps, "tone" | "outline"> {
  if (v === "default") return { tone: "success" };
  if (v === "destructive") return { tone: "danger" };
  return { tone: "neutral", outline: v === "outline" };
}
