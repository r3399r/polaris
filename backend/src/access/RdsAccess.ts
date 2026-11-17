import {
  DescribeDBInstancesCommand,
  RDSClient,
  StopDBInstanceCommand,
} from '@aws-sdk/client-rds';
import { inject, injectable } from 'inversify';

/**
 * Access class for AWS RDS.
 */
@injectable()
export class RdsAccess {
  @inject(RDSClient)
  private readonly client!: RDSClient;

  public async describeDbInstance(identifier: string) {
    const res = await this.client.send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: identifier })
    );

    return res.DBInstances?.[0];
  }

  public async stopDbInstance(identifier: string) {
    await this.client.send(
      new StopDBInstanceCommand({ DBInstanceIdentifier: identifier })
    );
  }
}
