import {
  boolean,
  datetime,
  int,
  mysqlTable,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';

/**
 * Mirrors db/log_api.sql and db/ip.sql by hand. There is no drizzle-kit and no
 * migration runner: the DDL in db/*.sql is applied to the real database
 * manually, and this file only has to agree with it.
 *
 * Every DATETIME(3) is declared `mode: 'date'` so the mysql2 driver formats the
 * value into MySQL's DATETIME literal syntax itself. That syntax is not ISO
 * 8601 -- passing an ISO string through as `mode: 'string'` fails with
 * ER_TRUNCATED_WRONG_VALUE -- so these columns take a Date, never a string.
 */
export const logApiTable = mysqlTable('log_api', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  project: varchar('project', { length: 255 }).notNull(),
  resource: varchar('resource', { length: 255 }).notNull(),
  path: varchar('path', { length: 255 }).notNull(),
  httpMethod: varchar('http_method', { length: 16 }).notNull(),
  queryStringParameters: text('query_string_param'),
  body: text('body'),
  statusCode: int('status_code').notNull(),
  elapsedTime: int('elapsed_time').notNull(),
  version: varchar('version', { length: 64 }),
  ip: varchar('ip', { length: 64 }),
  dateRequested: datetime('date_requested', { mode: 'date', fsp: 3 }).notNull(),
  dateCreated: datetime('date_created', { mode: 'date', fsp: 3 }).notNull(),
});

export const ipTable = mysqlTable('ip', {
  ip: varchar('ip', { length: 64 }).primaryKey(),
  continent: varchar('continent', { length: 255 }).notNull(),
  country: varchar('country', { length: 255 }).notNull(),
  region: varchar('region', { length: 255 }).notNull(),
  city: varchar('city', { length: 255 }).notNull(),
  mobile: boolean('mobile').notNull(),
  dateCreated: datetime('date_created', { mode: 'date', fsp: 3 }).notNull(),
});
