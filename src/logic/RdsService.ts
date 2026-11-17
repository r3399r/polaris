import { inject, injectable } from 'inversify';
import { RdsAccess } from 'src/access/RdsAccess';

/**
 * Service class for RDS cost saving.
 */
@injectable()
export class RdsService {
  @inject(RdsAccess)
  private readonly rdsAccess!: RdsAccess;

  /**
   * Stop the MySQL instance pointed by MYSQL_DB_HOST if it is running.
   * The instance identifier is the first label of the RDS endpoint, e.g.
   * celestial-studio-mysql-test.xxxx.ap-east-2.rds.amazonaws.com
   * -> celestial-studio-mysql-test
   */
  public async stopDb() {
    const host = process.env.MYSQL_DB_HOST;
    if (!host) throw new Error('MYSQL_DB_HOST is not set');

    const identifier = host.split('.')[0];
    console.log(`checking db instance ${identifier}...`);

    const instance = await this.rdsAccess.describeDbInstance(identifier);
    if (instance === undefined)
      throw new Error(`db instance ${identifier} not found`);

    const status = instance.DBInstanceStatus;
    if (status !== 'available') {
      console.log(`skip stopping ${identifier}, current status: ${status}`);

      return;
    }

    console.log(`stopping ${identifier}...`);
    await this.rdsAccess.stopDbInstance(identifier);
    console.log(`${identifier} stop requested`);
  }
}
