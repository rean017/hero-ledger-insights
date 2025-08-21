export default function LocationsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card-base animate-pulse p-4">
          <div className="h-4 w-1/2 rounded bg-zinc-200 mb-4" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="h-12 rounded-xl bg-zinc-100" />
            <div className="h-12 rounded-xl bg-zinc-100" />
            <div className="h-12 rounded-xl bg-zinc-100" />
            <div className="h-12 rounded-xl bg-zinc-100" />
            <div className="h-12 rounded-xl bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}