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
 * COCKROACH_DB_CLUSTER selects between two shapes, and its presence is the
 * switch rather than a separate flag because production always resolves it from
 * SSM and a local single node has no such thing:
 *
 *   set   -- CockroachDB Cloud. The cluster is identified twice, once prefixed
 *            onto the database name and once as the `--cluster` startup
 *            option. Both are Cloud routing mechanisms, and the TypeORM config
 *            this replaces set both and worked, so neither is dropped on a
 *            guess. TLS required.
 *   unset -- `cockroach start-single-node --insecure` from docker-compose.yml.
 *            No TLS, no routing, plain database name.
 *
 * Same pool lifetime as MySQL: one per execution environment, never closed.
 */
export const getCockroachDb = (): NodePgDatabase => {
  if (db === undefined) {
    const cluster = process.env.COCKROACH_DB_CLUSTER;
    const common = {
      host: process.env.COCKROACH_DB_HOST,
      port: Number(process.env.COCKROACH_DB_PORT ?? 26257),
      user: process.env.COCKROACH_DB_USER,
      password: process.env.COCKROACH_DB_PASSWORD,
      max: Number(process.env.DB_POOL_SIZE ?? 2),
    };

    pool = new Pool(
      cluster
        ? {
            ...common,
            database: `${cluster}.${process.env.PROJECT}`,
            ssl: true,
            options: `--cluster=${cluster}`,
          }
        : { ...common, database: process.env.PROJECT }
    );
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
