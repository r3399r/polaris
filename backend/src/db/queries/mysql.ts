import { count, desc, eq, lt, sql } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { ipTable, logApiTable } from 'src/db/schema/mysql';

/**
 * Either the pool-backed database or a transaction handle -- the `logger`
 * handler wraps its work in `db.transaction()` and passes the tx down, and
 * every query here has to accept both.
 */
type TransactionCallback = Parameters<MySql2Database['transaction']>[0];
export type MysqlDb = MySql2Database | Parameters<TransactionCallback>[0];

export type LogApiInsert = typeof logApiTable.$inferInsert;
export type IpInsert = typeof ipTable.$inferInsert;
export type IpRow = typeof ipTable.$inferSelect;

const THREE_MONTHS_OLD = sql`date_created < DATE_SUB(NOW(), INTERVAL 3 MONTH)`;

export const insertLogApi = async (db: MysqlDb, rows: LogApiInsert[]) => {
  // drizzle rejects an empty VALUES list, and the old TypeORM save() silently
  // did nothing -- so the no-rows case is handled here rather than at every
  // call site.
  if (rows.length === 0) return;

  await db.insert(logApiTable).values(rows);
};

export const countLogApi = async (db: MysqlDb) => {
  const [row] = await db.select({ n: count() }).from(logApiTable);

  return row?.n ?? 0;
};

/**
 * The `date_created` of the row sitting just past the row cap, ordered newest
 * first -- i.e. the oldest row that is allowed to stay. Undefined when the
 * table has fewer rows than the offset.
 */
// The return type is annotated rather than inferred: without
// noUncheckedIndexedAccess, destructuring an array gives TS a non-optional
// element, so the inferred type would claim a Date is always found. It is not
// -- a table with fewer rows than `keep` yields nothing, and the caller's
// behaviour in that case is load-bearing (HouseKeepingService deletes nothing).
export const findLogApiCutoff = async (
  db: MysqlDb,
  keep: number
): Promise<Date | undefined> => {
  const [row] = await db
    .select({ dateCreated: logApiTable.dateCreated })
    .from(logApiTable)
    .orderBy(desc(logApiTable.dateCreated))
    .limit(1)
    .offset(keep);

  return row?.dateCreated;
};

export const deleteLogApiBefore = async (db: MysqlDb, cutoff: Date) => {
  await db.delete(logApiTable).where(lt(logApiTable.dateCreated, cutoff));
};

export const deleteLogApiOlderThanThreeMonths = async (db: MysqlDb) => {
  await db.delete(logApiTable).where(THREE_MONTHS_OLD);
};

// Annotated for the same reason as findLogApiCutoff above: an unknown ip
// legitimately returns nothing, and the caller branches on that.
export const findIp = async (
  db: MysqlDb,
  ip: string
): Promise<IpRow | undefined> => {
  const [row] = await db
    .select()
    .from(ipTable)
    .where(eq(ipTable.ip, ip))
    .limit(1);

  return row;
};

/**
 * Insert-if-absent, because a duplicate is expected here and is not an error.
 *
 * LoggerService calls findIp first, but the event source mapping allows two
 * concurrent batches, so both can see the same unknown ip, both look it up and
 * both insert -- and the loser got `ER_DUP_ENTRY: Duplicate entry for key
 * 'ip.PRIMARY'`, failing the transaction and rolling the whole batch back. The
 * race is not new; TypeORM's `manager.save()` hid it by issuing an UPDATE when
 * the primary key already existed.
 *
 * `ON DUPLICATE KEY UPDATE ip = ip` rather than `INSERT IGNORE`: IGNORE
 * downgrades *every* error to a warning, including a value too long for its
 * column, which would silently truncate the geo data. This handles the key
 * conflict and nothing else.
 *
 * The existing row is left exactly as it was. The geo data for an ip does not
 * meaningfully change, and keeping the first `date_created` is also what
 * TypeORM did -- its @BeforeInsert hook never ran on the update path.
 */
export const insertIps = async (db: MysqlDb, rows: IpInsert[]) => {
  if (rows.length === 0) return;

  await db
    .insert(ipTable)
    .values(rows)
    .onDuplicateKeyUpdate({ set: { ip: sql`ip` } });
};

export const deleteIpOlderThanThreeMonths = async (db: MysqlDb) => {
  await db.delete(ipTable).where(THREE_MONTHS_OLD);
};
