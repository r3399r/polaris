import { inject, injectable } from 'inversify';
import { DbAccess } from 'src/access/DbAccess';

/**
 * Service class for House Keeping
 */
@injectable()
export class HouseKeepingService {
  @inject(DbAccess)
  private readonly dbAccess!: DbAccess;

  public async houseKeep() {
    // clean cockroach db
    await this.dbAccess.resetSqlStats();

    // clean monitor history
    await this.dbAccess.query(
      "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
    );

    // clean log of api
    await this.dbAccess.query(
      "delete from log_api la where la.date_created < NOW() - interval '7 day'"
    );
  }
}
