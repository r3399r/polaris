import 'reflect-metadata';
import { Container } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';
import { MonitorAccess } from 'src/access/MonitorAccess';
import { MonitorHisAccess } from 'src/access/MonitorHisAccess';
import { GoogleApiService } from 'src/logic/GoogleApiService';
import { MonitorService } from 'src/logic/MonitorService';
import { Monitor } from 'src/model/entity/MonitorEntity';

const monitor = (over: Partial<Monitor> = {}): Monitor => ({
  name: 'daily',
  sql: 'select 1',
  refreshPeriod: '1',
  append: false,
  ...over,
});

describe('MonitorService', () => {
  let container: Container;
  let service: MonitorService;
  let sheet: {
    clear: jest.Mock;
    setHeaderRow: jest.Mock;
    addRows: jest.Mock;
  };
  let dbAccess: { query: jest.Mock };
  let monitorAccess: { find: jest.Mock };
  let monitorHisAccess: { save: jest.Mock };
  let googleApiService: { getSheet: jest.Mock };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.SQL_LIMIT = '2';

    sheet = {
      clear: jest.fn(),
      setHeaderRow: jest.fn(),
      addRows: jest.fn(),
    };
    dbAccess = { query: jest.fn().mockResolvedValue([]) };
    monitorAccess = { find: jest.fn().mockResolvedValue([]) };
    monitorHisAccess = { save: jest.fn() };
    googleApiService = { getSheet: jest.fn().mockResolvedValue(sheet) };

    container = new Container();
    container.bind<any>(CockroachDbAccess).toConstantValue(dbAccess);
    container.bind<any>(MonitorAccess).toConstantValue(monitorAccess);
    container.bind<any>(MonitorHisAccess).toConstantValue(monitorHisAccess);
    container.bind<any>(GoogleApiService).toConstantValue(googleApiService);
    container.bind<MonitorService>(MonitorService).toSelf();
    service = container.get(MonitorService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('SQL_LIMIT', () => {
    it('throws when unset', async () => {
      delete process.env.SQL_LIMIT;
      await expect(service.monitorAll()).rejects.toThrow('SQL_LIMIT');
    });

    it('throws when not a number', async () => {
      process.env.SQL_LIMIT = 'lots';
      await expect(service.monitorAll()).rejects.toThrow('SQL_LIMIT');
    });

    it('is checked before any monitor runs', async () => {
      process.env.SQL_LIMIT = 'lots';
      monitorAccess.find.mockResolvedValue([monitor()]);
      await expect(service.monitorAll()).rejects.toThrow('SQL_LIMIT');
      expect(dbAccess.query).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('appends limit/offset and pages until an empty page', async () => {
      monitorAccess.find.mockResolvedValue([monitor()]);
      dbAccess.query
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([{ a: 3 }])
        .mockResolvedValueOnce([]);

      await service.monitorAll();

      expect(dbAccess.query.mock.calls.map((c) => c[0])).toEqual([
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
      monitorAccess.find.mockResolvedValue([monitor()]);
      dbAccess.query
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([]);

      await service.monitorAll();

      expect(dbAccess.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('writing to the sheet', () => {
    beforeEach(() => {
      dbAccess.query
        .mockResolvedValueOnce([{ a: 1, b: 2 }])
        .mockResolvedValueOnce([]);
    });

    it('clears the tab first when append is false', async () => {
      monitorAccess.find.mockResolvedValue([monitor({ append: false })]);
      await service.monitorAll();
      expect(sheet.clear).toHaveBeenCalled();
    });

    it('does not clear the tab when append is true', async () => {
      monitorAccess.find.mockResolvedValue([monitor({ append: true })]);
      await service.monitorAll();
      expect(sheet.clear).not.toHaveBeenCalled();
    });

    it('takes the header row from the keys of the first row', async () => {
      monitorAccess.find.mockResolvedValue([monitor()]);
      await service.monitorAll();
      expect(sheet.setHeaderRow).toHaveBeenCalledWith(['a', 'b']);
    });

    it('asks for the tab named after the monitor', async () => {
      monitorAccess.find.mockResolvedValue([monitor({ name: 'orders' })]);
      await service.monitorAll();
      expect(googleApiService.getSheet).toHaveBeenCalledWith('orders');
    });
  });

  describe('monitor_his', () => {
    it('records a success with the row count as a string', async () => {
      monitorAccess.find.mockResolvedValue([monitor({ name: 'orders' })]);
      dbAccess.query
        .mockResolvedValueOnce([{ a: 1 }, { a: 2 }])
        .mockResolvedValueOnce([]);

      await service.monitorAll();

      expect(monitorHisAccess.save).toHaveBeenCalledTimes(1);
      const saved = monitorHisAccess.save.mock.calls[0][0];
      expect(saved.name).toBe('orders');
      expect(saved.rowCount).toBe('2');
      expect(saved.success).toBe(true);
      expect(typeof saved.elapsedTime).toBe('number');
    });

    it('records a failure when the query throws', async () => {
      monitorAccess.find.mockResolvedValue([monitor()]);
      dbAccess.query.mockRejectedValue(new Error('boom'));

      await service.monitorAll();

      const saved = monitorHisAccess.save.mock.calls[0][0];
      expect(saved.success).toBe(false);
      expect(saved.rowCount).toBeNull();
    });

    it('records a failure when the sheet throws', async () => {
      monitorAccess.find.mockResolvedValue([monitor()]);
      dbAccess.query
        .mockResolvedValueOnce([{ a: 1 }])
        .mockResolvedValueOnce([]);
      sheet.addRows.mockRejectedValue(new Error('google is down'));

      await service.monitorAll();

      expect(monitorHisAccess.save.mock.calls[0][0].success).toBe(false);
    });

    // Current behaviour, and a real gap: a monitor whose query returns nothing
    // leaves no trace at all, so "it ran and found nothing" and "it never ran"
    // look identical in monitor_his.
    it('records NOTHING when the query returns no rows', async () => {
      monitorAccess.find.mockResolvedValue([monitor()]);
      dbAccess.query.mockResolvedValue([]);

      await service.monitorAll();

      expect(monitorHisAccess.save).not.toHaveBeenCalled();
      expect(googleApiService.getSheet).not.toHaveBeenCalled();
    });
  });

  describe('one failure does not stop the rest', () => {
    it('carries on to the next monitor', async () => {
      monitorAccess.find.mockResolvedValue([
        monitor({ name: 'first' }),
        monitor({ name: 'second' }),
      ]);
      dbAccess.query
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce([{ a: 1 }])
        .mockResolvedValueOnce([]);

      await service.monitorAll();

      expect(monitorHisAccess.save).toHaveBeenCalledTimes(2);
      expect(monitorHisAccess.save.mock.calls[0][0].name).toBe('first');
      expect(monitorHisAccess.save.mock.calls[0][0].success).toBe(false);
      expect(monitorHisAccess.save.mock.calls[1][0].name).toBe('second');
      expect(monitorHisAccess.save.mock.calls[1][0].success).toBe(true);
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
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
      monitorAccess.find.mockResolvedValue([
        monitor({ name: 'hourly', refreshPeriod: '1' }),
        monitor({ name: 'daily', refreshPeriod: '24' }),
        monitor({ name: 'odd', refreshPeriod: '7' }),
      ]);
      dbAccess.query.mockResolvedValue([]);

      await service.monitorAll();

      expect(dbAccess.query).toHaveBeenCalledTimes(3);
    });

    it('would skip at a non-zero hour, which production never reaches', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1, 5, 0, 0));
      monitorAccess.find.mockResolvedValue([
        monitor({ name: 'skipped', refreshPeriod: '24' }),
        monitor({ name: 'ran', refreshPeriod: '5' }),
      ]);
      dbAccess.query.mockResolvedValue([]);

      await service.monitorAll();

      expect(dbAccess.query).toHaveBeenCalledTimes(1);
    });
  });
});
