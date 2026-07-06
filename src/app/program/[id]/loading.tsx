// Instant skeleton for the printable program while it renders server-side.
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-2xl space-y-4 p-6"
      aria-busy="true"
      aria-label="Loading program"
    >
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded-sm bg-muted" />
      <div className="mx-auto h-4 w-1/3 animate-pulse rounded-sm bg-muted" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded-sm bg-muted"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
