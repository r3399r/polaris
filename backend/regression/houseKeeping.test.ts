import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeCockroachDb, getCockroachDb } from 'src/db/cockroach';
import { closeMysqlDb, getMysqlDb } from 'src/db/mysql';
import { findLogApiCutoff } from 'src/db/queries/mysql';
import { monitorHisTable } from 'src/db/schema/cockroach';
import { ipTable, logApiTable } from 'src/db/schema/mysql';
import { houseKeep } from 'src/logic/HouseKeepingService';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

const logRow = (dateCreated: Date) => ({
  project: 'altarf',
  resource: 'user',
  path: '/user/1',
  httpMethod: 'GET',
  queryStringParameters: null,
  body: null,
  statusCode: 200,
  elapsedTime: 12,
  version: '1.0.0',
  ip: null,
  dateRequested: dateCreated,
  dateCreated,
});

const ipRow = (ip: string, dateCreated: Date) => ({
  ip,
  continent: 'Asia',
  country: 'Taiwan',
  region: 'Taipei',
  city: 'Taipei',
  mobile: false,
  dateCreated,
});

describe('houseKeep against real databases', () => {
  beforeEach(async () => {
    delete process.env.RESET_SQL_STATS;
    const mysql = getMysqlDb();
    await mysql.delete(logApiTable);
    await mysql.delete(ipTable);
    await getCockroachDb().delete(monitorHisTable);
  });

  afterAll(async () => {
    await closeMysqlDb();
    await closeCockroachDb();
  });

  it('prunes monitor_his past 14 days and keeps the rest', async () => {
    const cockroach = getCockroachDb();
    await cockroach.insert(monitorHisTable).values([
      { name: 'old', success: true, dateCreated: daysAgo(20) },
      { name: 'edge', success: true, dateCreated: daysAgo(13) },
      { name: 'fresh', success: true, dateCreated: daysAgo(1) },
    ]);

    await houseKeep(cockroach, getMysqlDb());

    const rows = await cockroach.select().from(monitorHisTable);
    expect(rows.map((r) => r.name).sort()).toEqual(['edge', 'fresh']);
  });

  it('prunes log_api past three months when under the row cap', async () => {
    const mysql = getMysqlDb();
    await mysql
      .insert(logApiTable)
      .values([logRow(daysAgo(120)), logRow(daysAgo(30))]);

    await houseKeep(getCockroachDb(), mysql);

    const rows = await mysql.select().from(logApiTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateCreated.getTime()).toBeGreaterThan(
      daysAgo(60).getTime()
    );
  });

  it('prunes ip past three months', async () => {
    const mysql = getMysqlDb();
    await mysql
      .insert(ipTable)
      .values([ipRow('1.1.1.1', daysAgo(120)), ipRow('8.8.8.8', daysAgo(30))]);

    await houseKeep(getCockroachDb(), mysql);

    const rows = await mysql.select().from(ipTable);
    expect(rows.map((r) => r.ip)).toEqual(['8.8.8.8']);
  });

  it('resets cockroach sql stats when asked, without erroring', async () => {
    process.env.RESET_SQL_STATS = 'true';
    await expect(
      houseKeep(getCockroachDb(), getMysqlDb())
    ).resolves.toBeUndefined();
  });

  // The row-cap branch cannot be driven through houseKeep without inserting
  // 130,001 rows, so the query it depends on is checked directly instead. Which
  // branch runs is already covered by the unit test; what is unproven without a
  // real database is whether this ordering/offset actually finds the right row.
  describe('the row-cap cutoff query', () => {
    it('returns the date of the row just past the ones being kept', async () => {
      const mysql = getMysqlDb();
      await mysql
        .insert(logApiTable)
        .values([1, 2, 3, 4, 5].map((n) => logRow(daysAgo(n))));

      // keep the 2 newest -- daysAgo(1) and daysAgo(2) -- so the cutoff is the
      // third newest, daysAgo(3)
      const cutoff = await findLogApiCutoff(mysql, 2);

      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff?.getTime()).toBeCloseTo(daysAgo(3).getTime(), -4);
    });

    it('returns undefined when the table holds fewer rows than that', async () => {
      const mysql = getMysqlDb();
      await mysql.insert(logApiTable).values([logRow(daysAgo(1))]);

      expect(await findLogApiCutoff(mysql, 5)).toBeUndefined();
    });
  });
});
