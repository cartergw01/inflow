import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * Cached on globalThis, not module scope: Next dev builds separate module
 * graphs for pages and route handlers in one process, and two PGlite
 * instances on one data dir don't see each other's writes.
 */
const globalCache = globalThis as unknown as { __inflowDb?: Db };

/**
 * Driver selection: DATABASE_URL present → Neon serverless HTTP (prod/preview);
 * absent → PGlite persisted under .pglite/ (local dev, no Postgres install).
 * Both expose the same Drizzle query API over the same schema.
 */
export function getDb(): Db {
  if (globalCache.__inflowDb) return globalCache.__inflowDb;
  let dbInstance: Db;

  const url = process.env.DATABASE_URL;
  if (url) {
    dbInstance = drizzleNeon(neon(url), { schema });
  } else {
    // Lazy-require so the PGlite WASM bundle never ships to production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzlePglite } = require("drizzle-orm/pglite");
    const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
    dbInstance = drizzlePglite(client, { schema }) as unknown as Db;
  }
  globalCache.__inflowDb = dbInstance;
  return dbInstance;
}

export { schema };
