import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import { createPool, Pool } from 'mysql2/promise';

let pool: Pool | undefined;
let db: MySql2Database | undefined;

/**
 * One pool per Lambda execution environment, reused across warm invocations and
 * never torn down -- which is what the old `cleanUp()` effectively did anyway,
 * since it only ever released the query runner.
 *
 * The size is capped because each concurrent execution environment gets its own
 * pool, and an uncapped pool multiplies against however many containers are
 * warm at once. The cap keeps a single container polite; it is not a fix for
 * connection storms under high concurrency.
 */
export const getMysqlDb = (): MySql2Database => {
  if (db === undefined) {
    pool = createPool({
      host: process.env.MYSQL_DB_HOST,
      port: 3306,
      user: process.env.PROJECT,
      password: process.env.MYSQL_DB_PASSWORD,
      database: process.env.PROJECT,
      connectionLimit: Number(process.env.DB_POOL_SIZE ?? 2),
    });
    db = drizzle(pool);
  }

  return db;
};

/** Test-only teardown. Never called from a handler: see above. */
export const closeMysqlDb = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
  db = undefined;
};
