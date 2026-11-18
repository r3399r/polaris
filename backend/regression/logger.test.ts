import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMysqlDb, getMysqlDb } from 'src/db/mysql';
import { ipTable, logApiTable } from 'src/db/schema/mysql';
import * as ipApi from 'src/lib/ipApi';
import { saveApiLog } from 'src/logic/LoggerService';
import { QueueEvent } from 'src/model/Aws';
import { LoggerInput } from 'src/model/Logger';

// ip-api.com is the one thing here that stays mocked: it is external, rate
// limited, and nothing about it is what this suite is checking.
vi.mock('src/lib/ipApi');
const ip = vi.mocked(ipApi);

const baseInput: LoggerInput = {
  project: 'altarf',
  resource: 'user',
  path: '/user/1',
  httpMethod: 'GET',
  queryStringParameters: null,
  body: null,
  elapsedTime: 12,
  statusCode: 200,
  version: '1.0.0',
  ip: '8.8.8.8',
  dateRequested: '2026-11-18T04:05:06.789Z',
};

const ipInfo = {
  status: 'success',
  continent: 'Asia',
  country: 'Taiwan',
  regionName: 'Taipei',
  city: 'Taipei',
  mobile: false,
  query: '8.8.8.8',
};

const event = (overrides: Partial<LoggerInput>[]): QueueEvent =>
  ({
    Records: overrides.map((o, i) => ({
      messageId: String(i),
      body: JSON.stringify({ ...baseInput, ...o }),
    })),
  }) as unknown as QueueEvent;

describe('logger against a real MySQL', () => {
  beforeEach(async () => {
    const db = getMysqlDb();
    await db.delete(logApiTable);
    await db.delete(ipTable);
    ip.getIpInfo.mockReset().mockResolvedValue(ipInfo);
  });

  afterAll(async () => await closeMysqlDb());

  it('writes a log row that reads back with the right types', async () => {
    await saveApiLog(getMysqlDb(), event([{}]));

    const [row] = await getMysqlDb().select().from(logApiTable);
    expect(row.project).toBe('altarf');
    expect(row.httpMethod).toBe('GET');
    // INT columns: numbers in, numbers out. Under TypeORM these were strings.
    expect(row.statusCode).toBe(200);
    expect(row.elapsedTime).toBe(12);
    expect(row.id).toBeGreaterThan(0);
    expect(row.queryStringParameters).toBeNull();
  });

  // The reason every DATETIME column is declared `mode: 'date'`. A Date is
  // handed to the driver, which formats MySQL's own DATETIME literal syntax;
  // an ISO string would fail with ER_TRUNCATED_WRONG_VALUE. DATETIME has no
  // timezone, so what comes back is the same wall clock, to the millisecond.
  it('round-trips date_requested through DATETIME(3)', async () => {
    await saveApiLog(getMysqlDb(), event([{}]));

    const [row] = await getMysqlDb().select().from(logApiTable);
    expect(row.dateRequested).toBeInstanceOf(Date);
    expect(row.dateRequested.getTime()).toBe(
      new Date(baseInput.dateRequested).getTime()
    );
    expect(row.dateCreated).toBeInstanceOf(Date);
  });

  it('writes one row per record', async () => {
    await saveApiLog(getMysqlDb(), event([{}, {}, {}]));

    const rows = await getMysqlDb().select().from(logApiTable);
    expect(rows).toHaveLength(3);
  });

  // drizzle rejects an insert with an empty VALUES list, so insertLogApi
  // guards for it. Without that guard this throws.
  it('accepts an empty batch', async () => {
    await saveApiLog(getMysqlDb(), event([]));

    const rows = await getMysqlDb().select().from(logApiTable);
    expect(rows).toHaveLength(0);
  });

  describe('ip rows', () => {
    it('stores the looked-up geo data, booleans included', async () => {
      await saveApiLog(getMysqlDb(), event([{}]));

      const [row] = await getMysqlDb().select().from(ipTable);
      expect(row.ip).toBe('8.8.8.8');
      expect(row.region).toBe('Taipei');
      // BOOLEAN is tinyint(1) in MySQL; drizzle's boolean() has to map it back
      expect(row.mobile).toBe(false);
      expect(row.dateCreated).toBeInstanceOf(Date);
    });

    it('writes one row for an ip repeated across the batch', async () => {
      await saveApiLog(getMysqlDb(), event([{}, {}, {}]));

      const rows = await getMysqlDb().select().from(ipTable);
      expect(rows).toHaveLength(1);
      expect(ip.getIpInfo).toHaveBeenCalledTimes(1);
    });

    it('does not look up an ip already in the table', async () => {
      await saveApiLog(getMysqlDb(), event([{}]));
      ip.getIpInfo.mockClear();

      await saveApiLog(getMysqlDb(), event([{}]));

      expect(ip.getIpInfo).not.toHaveBeenCalled();
      const rows = await getMysqlDb().select().from(ipTable);
      expect(rows).toHaveLength(1);
    });
  });

  // What the `logger` handler's getMysqlDb().transaction(...) is for, and the
  // only way to see it: the ip row is inserted before the log rows, so a
  // failure on the log insert has something to roll back.
  describe('transaction', () => {
    const tooLongForTheColumn = 'x'.repeat(300);

    it('rolls the ip row back when the log insert fails', async () => {
      const db = getMysqlDb();

      await expect(
        db.transaction(
          async (tx) =>
            await saveApiLog(tx, event([{ project: tooLongForTheColumn }]))
        )
      ).rejects.toThrow();

      expect(await db.select().from(ipTable)).toHaveLength(0);
      expect(await db.select().from(logApiTable)).toHaveLength(0);
    });

    it('commits both when nothing fails', async () => {
      const db = getMysqlDb();

      await db.transaction(async (tx) => await saveApiLog(tx, event([{}])));

      expect(await db.select().from(ipTable)).toHaveLength(1);
      expect(await db.select().from(logApiTable)).toHaveLength(1);
    });
  });
});
