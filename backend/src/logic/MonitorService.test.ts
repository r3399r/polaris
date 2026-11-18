import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import * as cockroach from 'src/db/queries/cockroach';
import { CockroachDb } from 'src/db/queries/cockroach';
import * as googleSheets from 'src/lib/googleSheets';
import { monitorAll } from 'src/logic/MonitorService';

vi.mock('src/db/queries/cockroach');
vi.mock('src/lib/googleSheets');
const q = vi.mocked(cockroach);
const sheets = vi.mocked(googleSheets);

// The queries are mocked, so the handle itself is never dereferenced.
const db = {} as CockroachDb;

type MonitorRow = {
  name: string;
  sql: string;
  refreshPeriod: number;
  append: boolean;
};

const monitor = (over: Partial<MonitorRow> = {}): MonitorRow => ({
  name: 'daily',
  sql: 'select 1',
  refreshPeriod: 1,
  append: false,
  ...over,
});

describe('MonitorService', () => {
  let sheet: {
    clear: Mock;
    setHeaderRow: Mock;
    addRows: Mock;
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.SQL_LIMIT = '2';

    sheet = {
      clear: vi.fn(),
      setHeaderRow: vi.fn(),
      addRows: vi.fn(),
    };

    q.findMonitors.mockReset().mockResolvedValue([]);
    q.runRawQuery.mockReset().mockResolvedValue([]);
    q.insertMonitorHis.mockReset().mockResolvedValue(undefined);
    sheets.getSheet.mockReset().mockResolvedValue(sheet as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('SQL_LIMIT', () => {
    it('throws when unset', async () => {
      delete process.env.SQL_LIMIT;
      await expect(monitorAll(db)).rejects.toThrow('SQL_LIMIT');
    });

    it('throws when not a number', async () => {
      process.env.SQL_LIMIT = 'lots';
      await expect(monitorAll(db)).rejects.toThrow('SQL_LIMIT');
    });

    it('is checked before any monitor runs', async () => {
      process.env.SQL_LIMIT = 'lots';
      q.findMonitors.mockResolvedValue([monitor()]);
      await expect(monitorAll(db)).rejects.toThrow('SQL_LIMIT');
      expect(q.runRawQuery).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('appends limit/offset and pages until an empty page', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      q.runRawQuery
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([{ a: 3 }])
        .mockResolvedValueOnce([]);

      await monitorAll(db);

      expect(q.runRawQuery.mock.calls.map((c) => c[1])).toEqual([
        'select 1 limit 2 offset 0',
        'select 1 limit 2 offset 2',
        'select 1 limit 2 offset 4',
      ]);
      expect(sheet.addRows).toHaveBeenCalledWith([
        { a: 1 },
        { a: 2 },
        { a: 3 },
      ]);
    });

    it('still issues a second query when the first page is full', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      q.runRawQuery
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([]);

      await monitorAll(db);

      expect(q.runRawQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('writing to the sheet', () => {
    beforeEach(() => {
      q.runRawQuery
        .mockResolvedValueOnce([{ a: 1, b: 2 }])
        .mockResolvedValueOnce([]);
    });

    it('clears the tab first when append is false', async () => {
      q.findMonitors.mockResolvedValue([monitor({ append: false })]);
      await monitorAll(db);
      expect(sheet.clear).toHaveBeenCalled();
    });

    it('does not clear the tab when append is true', async () => {
      q.findMonitors.mockResolvedValue([monitor({ append: true })]);
      await monitorAll(db);
      expect(sheet.clear).not.toHaveBeenCalled();
    });

    it('takes the header row from the keys of the first row', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      await monitorAll(db);
      expect(sheet.setHeaderRow).toHaveBeenCalledWith(['a', 'b']);
    });

    it('asks for the tab named after the monitor', async () => {
      q.findMonitors.mockResolvedValue([monitor({ name: 'orders' })]);
      await monitorAll(db);
      expect(sheets.getSheet).toHaveBeenCalledWith('orders');
    });
  });

  describe('monitor_his', () => {
    it('records a success with the row count', async () => {
      q.findMonitors.mockResolvedValue([monitor({ name: 'orders' })]);
      q.runRawQuery
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([]);

      await monitorAll(db);

      expect(q.insertMonitorHis).toHaveBeenCalledTimes(1);
      const saved = q.insertMonitorHis.mock.calls[0][1];
      expect(saved.name).toBe('orders');
      expect(saved.rowCount).toBe(2);
      expect(saved.success).toBe(true);
      expect(typeof saved.elapsedTime).toBe('number');
    });

    it('records a failure when the query throws', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      q.runRawQuery.mockRejectedValue(new Error('boom'));

      await monitorAll(db);

      const saved = q.insertMonitorHis.mock.calls[0][1];
      expect(saved.success).toBe(false);
      expect(saved.rowCount).toBeNull();
    });

    it('records a failure when the sheet throws', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      q.runRawQuery.mockResolvedValueOnce([{ a: 1 }]).mockResolvedValueOnce([]);
      sheet.addRows.mockRejectedValue(new Error('google is down'));

      await monitorAll(db);

      expect(q.insertMonitorHis.mock.calls[0][1].success).toBe(false);
    });

    // Current behaviour, and a real gap: a monitor whose query returns nothing
    // leaves no trace at all, so "it ran and found nothing" and "it never ran"
    // look identical in monitor_his.
    it('records NOTHING when the query returns no rows', async () => {
      q.findMonitors.mockResolvedValue([monitor()]);
      q.runRawQuery.mockResolvedValue([]);

      await monitorAll(db);

      expect(q.insertMonitorHis).not.toHaveBeenCalled();
      expect(sheets.getSheet).not.toHaveBeenCalled();
    });
  });

  describe('one failure does not stop the rest', () => {
    it('carries on to the next monitor', async () => {
      q.findMonitors.mockResolvedValue([
        monitor({ name: 'first' }),
        monitor({ name: 'second' }),
      ]);
      q.runRawQuery
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce([{ a: 1 }])
        .mockResolvedValueOnce([]);

      await monitorAll(db);

      expect(q.insertMonitorHis).toHaveBeenCalledTimes(2);
      expect(q.insertMonitorHis.mock.calls[0][1].name).toBe('first');
      expect(q.insertMonitorHis.mock.calls[0][1].success).toBe(false);
      expect(q.insertMonitorHis.mock.calls[1][1].name).toBe('second');
      expect(q.insertMonitorHis.mock.calls[1][1].success).toBe(true);
    });
  });

  // These pin the CURRENT behaviour of refreshPeriod, which is inert in
  // production: the check is `new Date().getHours() % refreshPeriod`, getHours
  // is local time (UTC in Lambda), and the schedule fires at 00:01 UTC -- so
  // currentHour is always 0, and 0 % n === 0 for every n. Every monitor runs
  // every day whatever its configured period. Do not "fix" these tests; fixing
  // the behaviour is a separate, deliberate decision.
  //
  // The dates below are built from LOCAL components on purpose, so getHours()
  // returns the stated hour in any timezone the suite runs in.
  describe('refreshPeriod (currently inert)', () => {
    it('runs every monitor at hour 0, whatever the period', async () => {
      vi.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
      q.findMonitors.mockResolvedValue([
        monitor({ name: 'hourly', refreshPeriod: 1 }),
        monitor({ name: 'daily', refreshPeriod: 24 }),
        monitor({ name: 'odd', refreshPeriod: 7 }),
      ]);
      q.runRawQuery.mockResolvedValue([]);

      await monitorAll(db);

      expect(q.runRawQuery).toHaveBeenCalledTimes(3);
    });

    it('would skip at a non-zero hour, which production never reaches', async () => {
      vi.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 5, 0, 0));
      q.findMonitors.mockResolvedValue([
        monitor({ name: 'skipped', refreshPeriod: 24 }),
        monitor({ name: 'ran', refreshPeriod: 5 }),
      ]);
      q.runRawQuery.mockResolvedValue([]);

      await monitorAll(db);

      expect(q.runRawQuery).toHaveBeenCalledTimes(1);
    });
  });
});
