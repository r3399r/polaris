import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeCockroachDb, getCockroachDb } from 'src/db/cockroach';
import { monitorHisTable, monitorTable } from 'src/db/schema/cockroach';
import * as googleSheets from 'src/lib/googleSheets';
import { monitorAll } from 'src/logic/MonitorService';

// The spreadsheet stays mocked: it is external, and writing to a real tab from
// a test is not something to arrange by accident.
vi.mock('src/lib/googleSheets');
const sheets = vi.mocked(googleSheets);

// refreshPeriod 1 so `getHours() % period === 0` holds at any hour.
const monitor = (name: string, sql: string, append = false) => ({
  name,
  sql,
  refreshPeriod: 1,
  append,
});

describe('monitorAll against a real CockroachDB', () => {
  let sheet: {
    clear: ReturnType<typeof vi.fn>;
    setHeaderRow: ReturnType<typeof vi.fn>;
    addRows: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    process.env.SQL_LIMIT = '500';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const db = getCockroachDb();
    await db.delete(monitorHisTable);
    await db.delete(monitorTable);

    sheet = { clear: vi.fn(), setHeaderRow: vi.fn(), addRows: vi.fn() };
    sheets.getSheet.mockReset().mockResolvedValue(sheet as never);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await closeCockroachDb();
  });

  it('runs the stored sql and records the outcome', async () => {
    const db = getCockroachDb();
    await db
      .insert(monitorTable)
      .values(monitor('orders', "select 1 as n, 'a' as label"));

    await monitorAll(db);

    expect(sheets.getSheet).toHaveBeenCalledWith('orders');
    expect(sheet.setHeaderRow).toHaveBeenCalledWith(['n', 'label']);
    // "1", not 1. The operator's SQL runs through sql.raw, so there is no
    // drizzle column type to convert anything: the pg driver's default parser
    // for INT8 -- which is every integer in CockroachDB -- returns a string,
    // to avoid losing precision past 2^53. TypeORM's manager.query() went
    // through the same parsers, so the Google Sheet has always been fed
    // strings for integer columns. Contrast monitor_his.rowCount below, which
    // IS read through the schema and does come back a number.
    expect(sheet.addRows).toHaveBeenCalledWith([{ n: '1', label: 'a' }]);

    const [his] = await db.select().from(monitorHisTable);
    expect(his.name).toBe('orders');
    expect(his.success).toBe(true);
    // row_count is INT8 in CockroachDB, which the pg driver hands back as a
    // string. bigint({ mode: 'number' }) is what makes this a number.
    expect(his.rowCount).toBe(1);
    expect(typeof his.elapsedTime).toBe('number');
    expect(his.dateCreated).toBeInstanceOf(Date);
    // defaulted by gen_random_uuid(), so it is never inserted
    expect(his.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('clears the tab first only when append is false', async () => {
    const db = getCockroachDb();
    await db
      .insert(monitorTable)
      .values(monitor('appending', 'select 1 as n', true));

    await monitorAll(db);

    expect(sheet.clear).not.toHaveBeenCalled();
  });

  it('pages through a result larger than SQL_LIMIT', async () => {
    process.env.SQL_LIMIT = '2';
    const db = getCockroachDb();
    await db
      .insert(monitorTable)
      .values(
        monitor(
          'paged',
          'select n from (values (1),(2),(3)) as t(n) order by n'
        )
      );

    await monitorAll(db);

    // strings again, for the reason spelled out in the first case
    expect(sheet.addRows).toHaveBeenCalledWith([
      { n: '1' },
      { n: '2' },
      { n: '3' },
    ]);
    const [his] = await db.select().from(monitorHisTable);
    expect(his.rowCount).toBe(3);
  });

  it('records a failure for broken sql and carries on to the next monitor', async () => {
    const db = getCockroachDb();
    await db
      .insert(monitorTable)
      .values([
        monitor('broken', 'select * from no_such_table'),
        monitor('works', 'select 1 as n'),
      ]);

    await monitorAll(db);

    const rows = await db.select().from(monitorHisTable);
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get('broken')?.success).toBe(false);
    expect(byName.get('broken')?.rowCount).toBeNull();
    expect(byName.get('works')?.success).toBe(true);
  });

  // Pinned behaviour, and a real gap: nothing distinguishes "ran, found
  // nothing" from "never ran".
  it('writes no history row at all when the query returns nothing', async () => {
    const db = getCockroachDb();
    await db
      .insert(monitorTable)
      .values(monitor('empty', 'select 1 as n where false'));

    await monitorAll(db);

    expect(sheets.getSheet).not.toHaveBeenCalled();
    expect(await db.select().from(monitorHisTable)).toHaveLength(0);
  });
});
