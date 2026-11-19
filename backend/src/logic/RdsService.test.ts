import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as rds from 'src/lib/rds';
import { getState, isReadOnly, startDb, stopDb } from 'src/logic/RdsService';

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
    process.env.TARGET_ENVR = 'test';
    mockRds.describeDbInstance.mockReset();
    mockRds.startDbInstance.mockReset();
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
      await expect(getState()).rejects.toThrow('MYSQL_DB_HOST');
    });

    it('throws when the instance does not exist', async () => {
      mockRds.describeDbInstance.mockResolvedValue(undefined);
      await expect(stopDb()).rejects.toThrow('not found');
    });
  });

  describe('getState', () => {
    it('allows start only when stopped', async () => {
      withStatus('stopped');

      expect(await getState()).toEqual({
        identifier: IDENTIFIER,
        status: 'stopped',
        canStart: true,
        canStop: false,
        readOnly: false,
      });
    });

    it('allows stop only when available', async () => {
      withStatus('available');

      expect(await getState()).toEqual({
        identifier: IDENTIFIER,
        status: 'available',
        canStart: false,
        canStop: true,
        readOnly: false,
      });
    });

    // RDS rejects both calls mid-transition, so the ui must not offer either.
    it.each(['starting', 'stopping', 'backing-up', 'modifying'])(
      'allows neither while %s',
      async (status) => {
        withStatus(status);
        const state = await getState();
        expect(state.canStart).toBe(false);
        expect(state.canStop).toBe(false);
      }
    );

    it('reports unknown when the api returns no status', async () => {
      mockRds.describeDbInstance.mockResolvedValue({});
      const state = await getState();
      expect(state.status).toBe('unknown');
      expect(state.canStart).toBe(false);
      expect(state.canStop).toBe(false);
    });

    it('never mutates the instance', async () => {
      withStatus('available');
      await getState();
      expect(mockRds.startDbInstance).not.toHaveBeenCalled();
      expect(mockRds.stopDbInstance).not.toHaveBeenCalled();
    });
  });

  // Each environment reports its own instance, but only test may act on it.
  // The ui needs `readOnly` to say why the buttons are dead -- `canStart` and
  // `canStop` alone look the same as a transition.
  describe('read-only environments', () => {
    it.each([
      ['prod', 'prod'],
      ['anything else', 'staging'],
      // fails safe: a missing variable must not grant the ability to stop a db
      ['unset', undefined],
    ])('reports readOnly when TARGET_ENVR is %s', async (_label, envr) => {
      if (envr === undefined) delete process.env.TARGET_ENVR;
      else process.env.TARGET_ENVR = envr;

      expect(isReadOnly()).toBe(true);

      withStatus('available');
      const state = await getState();
      expect(state.readOnly).toBe(true);
      expect(state.canStop).toBe(false);

      withStatus('stopped');
      expect((await getState()).canStart).toBe(false);
    });

    it('still reports the real status', async () => {
      process.env.TARGET_ENVR = 'prod';
      withStatus('available');

      const state = await getState();
      expect(state.status).toBe('available');
      expect(state.identifier).toBe(IDENTIFIER);
    });

    it('is not read-only in test', () => {
      process.env.TARGET_ENVR = 'test';
      expect(isReadOnly()).toBe(false);
    });
  });

  describe('startDb', () => {
    it('starts a stopped instance', async () => {
      withStatus('stopped');
      await startDb();
      expect(mockRds.startDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it.each(['available', 'starting', 'stopping', 'backing-up', 'modifying'])(
      'does not start while %s',
      async (status) => {
        withStatus(status);
        await startDb();
        expect(mockRds.startDbInstance).not.toHaveBeenCalled();
      }
    );
  });

  describe('stopDb', () => {
    it('stops an available instance', async () => {
      withStatus('available');
      await stopDb();
      expect(mockRds.stopDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

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
  });
});
