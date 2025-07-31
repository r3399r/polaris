import { inject, injectable } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';
import { IpAccess } from 'src/access/IpAccess';
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
  @inject(IpAccess)
  private readonly ipAccess!: IpAccess;

  public async houseKeep() {
    // clean cockroach db
    await this.cockroachDbAccess.resetSqlStats();

    // clean monitor history
    await this.cockroachDbAccess.query(
      "delete from monitor_his mh where mh.date_created < NOW() - interval '14 day'"
    );

    // clean log of api
    const qb1 = await this.logApiAccess.createQueryBuilder();
    await qb1
      .delete()
      .where('date_created < DATE_SUB(NOW(), INTERVAL 3 MONTH)')
      .execute();

    // clean ip
    const qb2 = await this.ipAccess.createQueryBuilder();
    await qb2
      .delete()
      .where('date_created < DATE_SUB(NOW(), INTERVAL 3 MONTH)')
      .execute();
  }
}
