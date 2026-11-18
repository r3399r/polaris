import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

/**
 * CockroachDB over the Postgres wire protocol. Drizzle's officially supported
 * target is Postgres, not CockroachDB; what makes that acceptable here is how
 * little this database is asked to do -- one select, one insert, and raw SQL
 * for everything else.
 *
 * The cluster is identified twice, which is deliberate and copied from the
 * TypeORM config this replaces: once prefixed onto the database name and once
 * as the `--cluster` startup option. Both are CockroachDB Cloud routing
 * mechanisms and the connection already worked with both set, so neither is
 * dropped here on a guess.
 *
 * Same pool lifetime as MySQL: one per execution environment, never closed.
 */
export const getCockroachDb = (): NodePgDatabase => {
  if (db === undefined) {
    pool = new Pool({
      host: process.env.COCKROACH_DB_HOST,
      port: 26257,
      user: process.env.COCKROACH_DB_USER,
      password: process.env.COCKROACH_DB_PASSWORD,
      database: `${process.env.COCKROACH_DB_CLUSTER}.${process.env.PROJECT}`,
      ssl: true,
      options: `--cluster=${process.env.COCKROACH_DB_CLUSTER}`,
      max: Number(process.env.DB_POOL_SIZE ?? 2),
    });
    db = drizzle(pool);
  }

  return db;
};

/** Test-only teardown. Never called from a handler: see above. */
export const closeCockroachDb = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
  db = undefined;
};
