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
  let rdsAccess: { describeDbInstance: jest.Mock; stopDbInstance: jest.Mock };

  const withStatus = (status: string) =>
    rdsAccess.describeDbInstance.mockResolvedValue({
      DBInstanceStatus: status,
    });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.MYSQL_DB_HOST = HOST;

    rdsAccess = {
      describeDbInstance: jest.fn(),
      stopDbInstance: jest.fn(),
    };

    container = new Container();
    container.bind<any>(RdsAccess).toConstantValue(rdsAccess);
    container.bind<RdsService>(RdsService).toSelf();
    service = container.get(RdsService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('instance identifier', () => {
    it('is the first label of the rds endpoint', async () => {
      withStatus('stopped');
      await service.stopDb();
      expect(rdsAccess.describeDbInstance).toHaveBeenCalledWith(IDENTIFIER);
    });

    it('throws when MYSQL_DB_HOST is unset', async () => {
      delete process.env.MYSQL_DB_HOST;
      await expect(service.stopDb()).rejects.toThrow('MYSQL_DB_HOST');
    });

    it('throws when the instance does not exist', async () => {
      rdsAccess.describeDbInstance.mockResolvedValue(undefined);
      await expect(service.stopDb()).rejects.toThrow('not found');
    });
  });

  describe('stopDb', () => {
    it('stops an available instance', async () => {
      withStatus('available');
      await service.stopDb();
      expect(rdsAccess.stopDbInstance).toHaveBeenCalledWith(IDENTIFIER);
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
      await service.stopDb();
      expect(rdsAccess.stopDbInstance).not.toHaveBeenCalled();
    });

    it('does not stop when the status is missing', async () => {
      rdsAccess.describeDbInstance.mockResolvedValue({});
      await service.stopDb();
      expect(rdsAccess.stopDbInstance).not.toHaveBeenCalled();
    });
  });
});
