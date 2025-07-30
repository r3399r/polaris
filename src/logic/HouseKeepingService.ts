import { inject, injectable } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';
import { LogApiAccess } from 'src/access/LogApiAccess';

/**
 * Service class for House Keeping
 */
@injectable()
export class HouseKeepingService {
  @inject(CockroachDbAccess)
  private readonly cockroachDbAccess!: CockroachDbAccess;
  @inject(LogApiAccess)
  private readonly logApiAccess!: LogApiAccess;

  public async houseKeep() {
    // clean cockroach db
    await this.cockroachDbAccess.resetSqlStats();

    // clean monitor history
    await this.cockroachDbAccess.query(
      "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
    );

    // clean log of api
    const qb = await this.logApiAccess.createQueryBuilder();
    await qb
      .delete()
      .where('date_requested < DATE_SUB(NOW(), INTERVAL 3 MONTH)')
      .execute();
  }
}
