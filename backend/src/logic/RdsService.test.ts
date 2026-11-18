import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as rds from 'src/lib/rds';
import { stopDb } from 'src/logic/RdsService';

vi.mock('src/lib/rds');
const mockRds = vi.mocked(rds);

const HOST =
  'celestial-studio-mysql-test.cj6syu0kqudx.ap-east-2.rds.amazonaws.com';
const IDENTIFIER = 'celestial-studio-mysql-test';

describe('RdsService', () => {
  const withStatus = (status: string) =>
    mockRds.describeDbInstance.mockResolvedValue({
      DBInstanceStatus: status,
    });

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.MYSQL_DB_HOST = HOST;
    mockRds.describeDbInstance.mockReset();
    mockRds.stopDbInstance.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('instance identifier', () => {
    it('is the first label of the rds endpoint', async () => {
      withStatus('stopped');
      await stopDb();
      expect(mockRds.describeDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it('throws when MYSQL_DB_HOST is unset', async () => {
      delete process.env.MYSQL_DB_HOST;
      await expect(stopDb()).rejects.toThrow('MYSQL_DB_HOST');
    });

    it('throws when the instance does not exist', async () => {
      mockRds.describeDbInstance.mockResolvedValue(undefined);
      await expect(stopDb()).rejects.toThrow('not found');
    });
  });

  describe('stopDb', () => {
    it('stops an available instance', async () => {
      withStatus('available');
      await stopDb();
      expect(mockRds.stopDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    // RDS rejects a stop in any other state, so a skipped run is normal and
    // the next scheduled run picks the instance up.
    it.each([
      'stopped',
      'stopping',
      'starting',
      'backing-up',
      'modifying',
      'configuring-enhanced-monitoring',
    ])('does not stop while %s', async (status) => {
      withStatus(status);
      await stopDb();
      expect(mockRds.stopDbInstance).not.toHaveBeenCalled();
    });

    it('does not stop when the status is missing', async () => {
      mockRds.describeDbInstance.mockResolvedValue({});
      await stopDb();
      expect(mockRds.stopDbInstance).not.toHaveBeenCalled();
    });
  });
});
