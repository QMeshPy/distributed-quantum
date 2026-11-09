export function DetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-48 rounded-xl bg-white/5 animate-pulse" />
      <div className="h-32 w-full rounded-2xl bg-white/[0.03] ring-1 ring-white/6 animate-pulse" />
      <div className="h-48 w-full rounded-2xl bg-white/[0.03] ring-1 ring-white/6 animate-pulse" />
      <div className="h-24 w-full rounded-2xl bg-white/[0.03] ring-1 ring-white/6 animate-pulse" />
    </div>
  );
}
