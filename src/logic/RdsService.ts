import { inject, injectable } from 'inversify';
import { RdsAccess } from 'src/access/RdsAccess';

export type DbState = {
  identifier: string;
  status: string;
  canStart: boolean;
  canStop: boolean;
  nextStop: string;
};

// the stop schedule, in UTC hours: 11:00 and 21:00 UTC are 19:00 and 05:00
// Asia/Taipei. Taiwan has no DST, so a fixed offset is exact.
const STOP_HOURS_UTC = [11, 21];

/**
 * Service class for RDS cost saving.
 */
@injectable()
export class RdsService {
  @inject(RdsAccess)
  private readonly rdsAccess!: RdsAccess;

  /**
   * The instance identifier is the first label of the RDS endpoint, e.g.
   * celestial-studio-mysql-test.xxxx.ap-east-2.rds.amazonaws.com
   * -> celestial-studio-mysql-test
   */
  private getIdentifier() {
    const host = process.env.MYSQL_DB_HOST;
    if (!host) throw new Error('MYSQL_DB_HOST is not set');

    return host.split('.')[0];
  }

  private async getStatus(identifier: string) {
    const instance = await this.rdsAccess.describeDbInstance(identifier);
    if (instance === undefined)
      throw new Error(`db instance ${identifier} not found`);

    return instance.DBInstanceStatus ?? 'unknown';
  }

  private nextScheduledStop(now: Date) {
    const candidates: number[] = [];
    for (const h of STOP_HOURS_UTC)
      for (const dayOffset of [0, 1])
        candidates.push(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + dayOffset,
            h
          )
        );

    return new Date(Math.min(...candidates.filter((t) => t > now.getTime())));
  }

  public async getState(): Promise<DbState> {
    const identifier = this.getIdentifier();
    const status = await this.getStatus(identifier);

    return {
      identifier,
      status,
      canStart: status === 'stopped',
      canStop: status === 'available',
      nextStop: this.nextScheduledStop(new Date()).toISOString(),
    };
  }

  /**
   * Stop the instance if it is running. RDS rejects a stop in any state other
   * than available, so anything else is logged and skipped.
   */
  public async stopDb() {
    const identifier = this.getIdentifier();
    console.log(`checking db instance ${identifier}...`);

    const status = await this.getStatus(identifier);
    if (status !== 'available') {
      console.log(`skip stopping ${identifier}, current status: ${status}`);

      return;
    }

    console.log(`stopping ${identifier}...`);
    await this.rdsAccess.stopDbInstance(identifier);
    console.log(`${identifier} stop requested`);
  }

  /**
   * Start the instance if it is stopped. Takes several minutes to become
   * available, so the caller is expected to poll.
   */
  public async startDb() {
    const identifier = this.getIdentifier();
    const status = await this.getStatus(identifier);
    if (status !== 'stopped') {
      console.log(`skip starting ${identifier}, current status: ${status}`);

      return;
    }

    console.log(`starting ${identifier}...`);
    await this.rdsAccess.startDbInstance(identifier);
    console.log(`${identifier} start requested`);
  }
}
