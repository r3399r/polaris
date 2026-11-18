import {
  bigint,
  boolean,
  doublePrecision,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Mirrors db/monitor.sql and db/monitor_his.sql by hand, through drizzle's
 * pg-core: CockroachDB speaks the Postgres wire protocol, so the pg dialect is
 * what applies. As with the MySQL schema there is no drizzle-kit and no
 * migration runner -- db/*.sql is applied manually and this only has to agree.
 *
 * CockroachDB's `STRING` is Postgres `TEXT`, and its `INT` is 64-bit (INT8),
 * which the pg driver hands back as a string. `bigint({ mode: 'number' })`
 * casts it, which is safe for a row count and a refresh period.
 */
export const monitorTable = pgTable('monitor', {
  name: text('name').primaryKey(),
  // operator-authored SQL, run as-is with limit/offset appended
  sql: text('sql').notNull(),
  refreshPeriod: bigint('refresh_period', { mode: 'number' }).notNull(),
  append: boolean('append').notNull(),
});

export const monitorHisTable = pgTable('monitor_his', {
  // defaults to gen_random_uuid() in the DDL, so it is never inserted
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rowCount: bigint('row_count', { mode: 'number' }),
  elapsedTime: doublePrecision('elapsed_time'),
  success: boolean('success'),
  dateCreated: timestamp('date_created', { mode: 'date' }),
});
