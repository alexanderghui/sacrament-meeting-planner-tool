// Applies Drizzle migrations, branching on DATABASE_URL exactly the way
// src/lib/db/index.ts does: hosted Postgres (Neon) when it's set, otherwise the
// local dev database in ./.pglite.
//
// `npm run build` runs this, so a deploy applies its own migrations. Schema
// changes used to depend on someone remembering to migrate the hosted database
// by hand, and a schema change reaching production without its migration is
// exactly how `sync_claims` came to be missing there.
//
// If a migration fails the build fails, which is the intent: shipping code whose
// schema hasn't been applied is worse than not shipping it.
async function main() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(url));
    // Note: the Neon HTTP driver has no transactions, so a migration that fails
    // partway is not rolled back. Keep migrations small and re-runnable.
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied to hosted Postgres");
    process.exit(0);
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite("./.pglite"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied to ./.pglite");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
