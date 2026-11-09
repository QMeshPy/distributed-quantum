export function DetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-48 rounded-xl bg-surface-muted animate-pulse" />
      <div className="h-32 w-full rounded-2xl bg-surface-muted ring-1 ring-border animate-pulse" />
      <div className="h-48 w-full rounded-2xl bg-surface-muted ring-1 ring-border animate-pulse" />
      <div className="h-24 w-full rounded-2xl bg-surface-muted ring-1 ring-border animate-pulse" />
    </div>
  );
}
