import { inject, injectable } from 'inversify';
import { Raw } from 'typeorm';
import { DbAccess } from 'src/access/DbAccess';
import { LogApiAccess } from 'src/access/LogApiAccess';
import { MonitorHisAccess } from 'src/access/MonitorHisAccess';

/**
 * Service class for House Keeping
 */
@injectable()
export class HouseKeepingService {
  @inject(DbAccess)
  private readonly dbAccess!: DbAccess;

  @inject(MonitorHisAccess)
  private readonly monitorHisAccess!: MonitorHisAccess;

  @inject(LogApiAccess)
  private readonly logApiAccess!: LogApiAccess;

  public async houseKeep() {
    // clean cockroach db
    await this.dbAccess.resetSqlStats();

    // clean monitor history
    await this.monitorHisAccess.hardDelete({
      where: {
        dateCreated: Raw((alias) => `${alias} < NOW() - interval '14 day'`),
      },
    });

    // clean log of api
    await this.logApiAccess.hardDelete({
      where: {
        dateCreated: Raw((alias) => `${alias} < NOW() - interval '7 day'`),
      },
    });
  }
}
