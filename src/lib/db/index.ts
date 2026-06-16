import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

let _db: Promise<DB> | null = null;

async function init(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    // Production / hosted Postgres (Neon) over HTTP — no TCP connection warmup,
    // which keeps serverless cold starts snappy.
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const sql = neon(process.env.DATABASE_URL);
    return drizzle(sql, { schema }) as unknown as DB;
  }

  // Local dev: in-process Postgres, persisted to ./.pglite — zero setup.
  // Tables are created by `npm run db:setup` / `npm run seed` (which run the
  // Drizzle migrations from a plain Node context), not at request time.
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite("./.pglite");
  return drizzlePglite(client, { schema });
}

export function getDb(): Promise<DB> {
  if (!_db) _db = init();
  return _db;
}
