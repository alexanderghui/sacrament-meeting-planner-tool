import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Applies Drizzle migrations to the local dev database (./.pglite).
// For hosted Postgres (Neon) use `drizzle-kit push` / `migrate` with DATABASE_URL.
async function main() {
  const client = new PGlite("./.pglite");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied to ./.pglite");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
