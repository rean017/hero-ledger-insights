export default function LocationsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card-base p-4">
          <div className="h-4 w-1/2 rounded bg-gradient-to-r from-zinc-200 via-brand-100 to-zinc-200 mb-4 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="h-12 rounded-xl bg-gradient-to-r from-zinc-100 via-brand-50 to-zinc-100 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            <div className="h-12 rounded-xl bg-gradient-to-r from-zinc-100 via-brand-50 to-zinc-100 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            <div className="h-12 rounded-xl bg-gradient-to-r from-zinc-100 via-brand-50 to-zinc-100 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            <div className="h-12 rounded-xl bg-gradient-to-r from-zinc-100 via-brand-50 to-zinc-100 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            <div className="h-12 rounded-xl bg-gradient-to-r from-zinc-100 via-brand-50 to-zinc-100 animate-pulse bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
          </div>
        </div>
      ))}
    </div>
  );
}