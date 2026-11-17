import 'reflect-metadata';
import { Container } from 'inversify';
import { RdsAccess } from 'src/access/RdsAccess';
import { RdsService } from 'src/logic/RdsService';

const HOST =
  'celestial-studio-mysql-test.cj6syu0kqudx.ap-east-2.rds.amazonaws.com';
const IDENTIFIER = 'celestial-studio-mysql-test';

describe('RdsService', () => {
  let container: Container;
  let service: RdsService;
  let mockRdsAccess: {
    describeDbInstance: jest.Mock;
    startDbInstance: jest.Mock;
    stopDbInstance: jest.Mock;
  };

  const withStatus = (status: string) =>
    mockRdsAccess.describeDbInstance.mockResolvedValue({
      DBInstanceStatus: status,
    });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.MYSQL_DB_HOST = HOST;
    mockRdsAccess = {
      describeDbInstance: jest.fn(),
      startDbInstance: jest.fn(),
      stopDbInstance: jest.fn(),
    };
    container = new Container();
    container.bind<any>(RdsAccess).toConstantValue(mockRdsAccess);
    container.bind<RdsService>(RdsService).toSelf();
    service = container.get(RdsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('identifier', () => {
    it('is the first label of the endpoint', async () => {
      withStatus('stopped');
      await service.getState();
      expect(mockRdsAccess.describeDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it('throws when MYSQL_DB_HOST is unset', async () => {
      delete process.env.MYSQL_DB_HOST;
      await expect(service.getState()).rejects.toThrow('MYSQL_DB_HOST');
    });
  });

  describe('getState', () => {
    it('allows start only when stopped', async () => {
      withStatus('stopped');
      const state = await service.getState();
      expect(state.identifier).toBe(IDENTIFIER);
      expect(state.status).toBe('stopped');
      expect(state.canStart).toBe(true);
      expect(state.canStop).toBe(false);
    });

    it('allows stop only when available', async () => {
      withStatus('available');
      const state = await service.getState();
      expect(state.canStart).toBe(false);
      expect(state.canStop).toBe(true);
    });

    it('allows neither in a transitional state', async () => {
      withStatus('backing-up');
      const state = await service.getState();
      expect(state.canStart).toBe(false);
      expect(state.canStop).toBe(false);
    });

    it('throws when the instance does not exist', async () => {
      mockRdsAccess.describeDbInstance.mockResolvedValue(undefined);
      await expect(service.getState()).rejects.toThrow('not found');
    });
  });

  describe('nextStop', () => {
    // 11:00 and 21:00 UTC are 19:00 and 05:00 Asia/Taipei
    it.each([
      ['2026-11-17T00:00:00Z', '2026-11-17T11:00:00.000Z'],
      ['2026-11-17T10:59:00Z', '2026-11-17T11:00:00.000Z'],
      ['2026-11-17T11:00:00Z', '2026-11-17T21:00:00.000Z'],
      ['2026-11-17T20:59:00Z', '2026-11-17T21:00:00.000Z'],
      ['2026-11-17T21:00:00Z', '2026-11-18T11:00:00.000Z'],
      ['2026-11-17T23:30:00Z', '2026-11-18T11:00:00.000Z'],
    ])('at %s the next stop is %s', async (now, expected) => {
      jest.useFakeTimers().setSystemTime(new Date(now));
      withStatus('stopped');
      const state = await service.getState();
      expect(state.nextStop).toBe(expected);
    });

    it('is always in the future and on a scheduled hour', async () => {
      withStatus('stopped');
      for (let m = 0; m < 60 * 24 * 2; m += 13) {
        const now = new Date(Date.UTC(2026, 10, 17) + m * 60000);
        jest.useFakeTimers().setSystemTime(now);
        const next = new Date((await service.getState()).nextStop);
        expect(next.getTime()).toBeGreaterThan(now.getTime());
        expect([11, 21]).toContain(next.getUTCHours());
        expect(next.getUTCMinutes()).toBe(0);
      }
    });
  });

  describe('startDb', () => {
    it('starts a stopped instance', async () => {
      withStatus('stopped');
      await service.startDb();
      expect(mockRdsAccess.startDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it.each(['available', 'starting', 'backing-up', 'modifying'])(
      'does not start while %s',
      async (status) => {
        withStatus(status);
        await service.startDb();
        expect(mockRdsAccess.startDbInstance).not.toHaveBeenCalled();
      }
    );
  });

  describe('stopDb', () => {
    it('stops an available instance', async () => {
      withStatus('available');
      await service.stopDb();
      expect(mockRdsAccess.stopDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it.each([
      'stopped',
      'stopping',
      'backing-up',
      'configuring-enhanced-monitoring',
    ])('does not stop while %s', async (status) => {
      withStatus(status);
      await service.stopDb();
      expect(mockRdsAccess.stopDbInstance).not.toHaveBeenCalled();
    });
  });
});
