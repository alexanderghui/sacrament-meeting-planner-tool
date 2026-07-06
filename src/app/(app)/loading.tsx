// Shown instantly on navigation into any app page while the server renders
// (auth + DB). Without this, a click leaves the old page frozen until the new
// one is fully ready, which reads as lag. A lightweight content-shaped skeleton
// makes navigation feel immediate.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-52 animate-pulse rounded-sm bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded-md bg-muted"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
