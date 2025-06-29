import { inject, injectable } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';

/**
 * Service class for House Keeping
 */
@injectable()
export class HouseKeepingService {
  @inject(CockroachDbAccess)
  private readonly dbAccess!: CockroachDbAccess;

  public async houseKeep() {
    // clean cockroach db
    await this.dbAccess.resetSqlStats();

    // clean monitor history
    await this.dbAccess.query(
      "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
    );

    // clean log of api
    // await this.dbAccess.query(
    //   "delete from log_api la where la.date_created < NOW() - interval '5 day'"
    // );
  }
}
