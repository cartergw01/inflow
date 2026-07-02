import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let dbInstance: Db | null = null;

/**
 * Driver selection: DATABASE_URL present → Neon serverless HTTP (prod/preview);
 * absent → PGlite persisted under .pglite/ (local dev, no Postgres install).
 * Both expose the same Drizzle query API over the same schema.
 */
export function getDb(): Db {
  if (dbInstance) return dbInstance;

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
  return dbInstance;
}

export { schema };
