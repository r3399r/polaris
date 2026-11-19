import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { monitorHisTable, monitorTable } from 'src/db/schema/cockroach';

export type CockroachDb = NodePgDatabase;

export type MonitorHisInsert = typeof monitorHisTable.$inferInsert;

export const findMonitors = async (db: CockroachDb) =>
  await db.select().from(monitorTable);

export const insertMonitorHis = async (
  db: CockroachDb,
  row: MonitorHisInsert
) => {
  await db.insert(monitorHisTable).values(row);
};

/**
 * Runs operator-authored SQL from the `monitor` table verbatim. It cannot be
 * parameterised or built with the query builder -- the whole point is that the
 * operator writes the statement -- so this is `sql.raw`, with every caveat that
 * implies. The `monitor` table is only writable by whoever administers the
 * database.
 */
export const runRawQuery = async (db: CockroachDb, statement: string) => {
  const result = await db.execute(sql.raw(statement));

  return result.rows;
};

export const deleteOldMonitorHis = async (db: CockroachDb) => {
  await db.execute(
    sql.raw(
      "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
    )
  );
};

export const resetSqlStats = async (db: CockroachDb) => {
  await db.execute(sql.raw('select crdb_internal.reset_sql_stats()'));
};
