import 'reflect-metadata';
import { Container } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';
import { IpAccess } from 'src/access/IpAccess';
import { LogApiAccess } from 'src/access/LogApiAccess';
import { HouseKeepingService } from 'src/logic/HouseKeepingService';

const THREE_MONTHS = 'date_created < DATE_SUB(NOW(), INTERVAL 3 MONTH)';

/** A chainable stand-in for TypeORM's delete query builder. */
type Qb = {
  delete: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
};

// The chaining is wired up after the object exists; returning `qb` from inside
// its own initializer makes its type circular and tsc refuses to infer it.
const makeQb = (): Qb => {
  const qb: Qb = {
    delete: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  qb.delete.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);

  return qb;
};

describe('HouseKeepingService', () => {
  let container: Container;
  let service: HouseKeepingService;
  let logApiQb: Qb;
  let ipQb: Qb;
  let cockroachDbAccess: { query: jest.Mock; resetSqlStats: jest.Mock };
  let logApiAccess: {
    count: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let ipAccess: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    delete process.env.RESET_SQL_STATS;
    logApiQb = makeQb();
    ipQb = makeQb();

    cockroachDbAccess = {
      query: jest.fn().mockResolvedValue(undefined),
      resetSqlStats: jest.fn().mockResolvedValue(undefined),
    };
    logApiAccess = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockResolvedValue(logApiQb),
    };
    ipAccess = { createQueryBuilder: jest.fn().mockResolvedValue(ipQb) };

    container = new Container();
    container.bind<any>(CockroachDbAccess).toConstantValue(cockroachDbAccess);
    container.bind<any>(LogApiAccess).toConstantValue(logApiAccess);
    container.bind<any>(IpAccess).toConstantValue(ipAccess);
    container.bind<HouseKeepingService>(HouseKeepingService).toSelf();
    service = container.get(HouseKeepingService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('cockroach sql stats', () => {
    it('resets them only when RESET_SQL_STATS is the string true', async () => {
      process.env.RESET_SQL_STATS = 'true';
      await service.houseKeep();
      expect(cockroachDbAccess.resetSqlStats).toHaveBeenCalled();
    });

    it('leaves them alone when the flag is absent', async () => {
      await service.houseKeep();
      expect(cockroachDbAccess.resetSqlStats).not.toHaveBeenCalled();
    });

    it('leaves them alone when the flag is the string false', async () => {
      process.env.RESET_SQL_STATS = 'false';
      await service.houseKeep();
      expect(cockroachDbAccess.resetSqlStats).not.toHaveBeenCalled();
    });
  });

  describe('monitor_his', () => {
    it('always deletes rows older than 14 days', async () => {
      await service.houseKeep();
      expect(cockroachDbAccess.query).toHaveBeenCalledWith(
        "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
      );
    });
  });

  describe('log_api', () => {
    it('deletes by age when the table is under the row cap', async () => {
      logApiAccess.count.mockResolvedValue(130000);
      await service.houseKeep();

      expect(logApiAccess.find).not.toHaveBeenCalled();
      expect(logApiQb.where).toHaveBeenCalledWith(THREE_MONTHS);
      expect(logApiQb.execute).toHaveBeenCalled();
    });

    it('deletes by row count once over the cap', async () => {
      logApiAccess.count.mockResolvedValue(130001);
      logApiAccess.find.mockResolvedValue([{ dateCreated: '2026-01-01' }]);

      await service.houseKeep();

      expect(logApiAccess.find).toHaveBeenCalledWith({
        skip: 130000,
        take: 1,
        order: { dateCreated: 'DESC' },
      });
      expect(logApiQb.where).toHaveBeenCalledWith(
        'date_created < :cutoffDate',
        { cutoffDate: '2026-01-01' }
      );
    });

    // Current behaviour: over the cap but the cutoff lookup came back empty,
    // so nothing is deleted at all -- not even the three-month sweep, because
    // that lives in the else branch.
    it('deletes nothing when over the cap but no cutoff row is found', async () => {
      logApiAccess.count.mockResolvedValue(130001);
      logApiAccess.find.mockResolvedValue([]);

      await service.houseKeep();

      expect(logApiQb.execute).not.toHaveBeenCalled();
    });
  });

  describe('ip', () => {
    it('always deletes rows older than three months', async () => {
      await service.houseKeep();
      expect(ipQb.where).toHaveBeenCalledWith(THREE_MONTHS);
      expect(ipQb.execute).toHaveBeenCalled();
    });

    it('runs even when the log_api branch deleted nothing', async () => {
      logApiAccess.count.mockResolvedValue(130001);
      logApiAccess.find.mockResolvedValue([]);

      await service.houseKeep();

      expect(ipQb.execute).toHaveBeenCalled();
    });
  });
});
