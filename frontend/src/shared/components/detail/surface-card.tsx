import { cn } from "@/lib/utils";

interface SurfaceCardProps {
  children: React.ReactNode;
  className?: string;
}

export function SurfaceCard({ children, className }: SurfaceCardProps) {
  return (
    <div
      className={cn("rounded-2xl p-5 ring-1 ring-border", className)}
      style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
    >
      {children}
    </div>
  );
}
