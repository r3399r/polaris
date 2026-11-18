import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cockroach from 'src/db/queries/cockroach';
import { CockroachDb } from 'src/db/queries/cockroach';
import * as mysql from 'src/db/queries/mysql';
import { MysqlDb } from 'src/db/queries/mysql';
import { houseKeep } from 'src/logic/HouseKeepingService';

vi.mock('src/db/queries/cockroach');
vi.mock('src/db/queries/mysql');
const c = vi.mocked(cockroach);
const m = vi.mocked(mysql);

// The queries are mocked, so neither handle is ever dereferenced.
const cockroachDb = {} as CockroachDb;
const mysqlDb = {} as MysqlDb;

const run = () => houseKeep(cockroachDb, mysqlDb);

describe('HouseKeepingService', () => {
  beforeEach(() => {
    delete process.env.RESET_SQL_STATS;

    c.resetSqlStats.mockReset().mockResolvedValue(undefined);
    c.deleteOldMonitorHis.mockReset().mockResolvedValue(undefined);
    m.countLogApi.mockReset().mockResolvedValue(0);
    m.findLogApiCutoff.mockReset().mockResolvedValue(undefined);
    m.deleteLogApiBefore.mockReset().mockResolvedValue(undefined);
    m.deleteLogApiOlderThanThreeMonths.mockReset().mockResolvedValue(undefined);
    m.deleteIpOlderThanThreeMonths.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('cockroach sql stats', () => {
    it('resets them only when RESET_SQL_STATS is the string true', async () => {
      process.env.RESET_SQL_STATS = 'true';
      await run();
      expect(c.resetSqlStats).toHaveBeenCalled();
    });

    it('leaves them alone when the flag is absent', async () => {
      await run();
      expect(c.resetSqlStats).not.toHaveBeenCalled();
    });

    it('leaves them alone when the flag is the string false', async () => {
      process.env.RESET_SQL_STATS = 'false';
      await run();
      expect(c.resetSqlStats).not.toHaveBeenCalled();
    });
  });

  describe('monitor_his', () => {
    // The 14-day interval itself now lives in db/queries/cockroach.ts and is
    // no longer asserted here; what this pins is that the delete is issued on
    // every run.
    it('always deletes rows older than 14 days', async () => {
      await run();
      expect(c.deleteOldMonitorHis).toHaveBeenCalledWith(cockroachDb);
    });
  });

  describe('log_api', () => {
    it('deletes by age when the table is under the row cap', async () => {
      m.countLogApi.mockResolvedValue(130000);
      await run();

      expect(m.findLogApiCutoff).not.toHaveBeenCalled();
      expect(m.deleteLogApiOlderThanThreeMonths).toHaveBeenCalledWith(mysqlDb);
      expect(m.deleteLogApiBefore).not.toHaveBeenCalled();
    });

    it('deletes by row count once over the cap', async () => {
      const cutoff = new Date('2026-01-01T00:00:00.000Z');
      m.countLogApi.mockResolvedValue(130001);
      m.findLogApiCutoff.mockResolvedValue(cutoff);

      await run();

      expect(m.findLogApiCutoff).toHaveBeenCalledWith(mysqlDb, 130000);
      expect(m.deleteLogApiBefore).toHaveBeenCalledWith(mysqlDb, cutoff);
      expect(m.deleteLogApiOlderThanThreeMonths).not.toHaveBeenCalled();
    });

    // Current behaviour: over the cap but the cutoff lookup came back empty,
    // so nothing is deleted at all -- not even the three-month sweep, because
    // that lives in the else branch.
    it('deletes nothing when over the cap but no cutoff row is found', async () => {
      m.countLogApi.mockResolvedValue(130001);
      m.findLogApiCutoff.mockResolvedValue(undefined);

      await run();

      expect(m.deleteLogApiBefore).not.toHaveBeenCalled();
      expect(m.deleteLogApiOlderThanThreeMonths).not.toHaveBeenCalled();
    });
  });

  describe('ip', () => {
    it('always deletes rows older than three months', async () => {
      await run();
      expect(m.deleteIpOlderThanThreeMonths).toHaveBeenCalledWith(mysqlDb);
    });

    it('runs even when the log_api branch deleted nothing', async () => {
      m.countLogApi.mockResolvedValue(130001);
      m.findLogApiCutoff.mockResolvedValue(undefined);

      await run();

      expect(m.deleteIpOlderThanThreeMonths).toHaveBeenCalled();
    });
  });
});
