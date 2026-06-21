// Apply a single Drizzle .sql migration file to the Neon database over HTTP.
// Usage: DATABASE_URL=postgres://… tsx scripts/apply-sql-neon.ts drizzle/0010_x.sql
//
// PGlite (local dev) is migrated with `npm run db:migrate`; this is the Neon
// counterpart for additive migrations. Statements are split on Drizzle's
// `--> statement-breakpoint` marker and run one at a time.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (Neon connection string).");
  process.exit(1);
}
const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/apply-sql-neon.ts <path-to-.sql>");
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync(file, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("--"));

async function main() {
  for (const stmt of statements) {
    console.log("→", stmt.replace(/\s+/g, " ").slice(0, 72));
    await sql.query(stmt);
  }
  console.log(`Applied ${statements.length} statement(s) from ${file} to Neon.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
