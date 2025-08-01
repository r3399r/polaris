import 'reflect-metadata';
import 'pg';
import { injectable, multiInject } from 'inversify';
import { DataSource, QueryRunner } from 'typeorm';

export const cockroachDbEntitiesBindingId = Symbol('CockroachDbEntities');
/**
 * CockroachDatabase manager class
 */
@injectable()
export class CockroachDatabase {
  private dataSource: DataSource | undefined = undefined;
  private queryRunner: QueryRunner | undefined = undefined;

  @multiInject(cockroachDbEntitiesBindingId)
  private readonly entities!: Function[];

  private async getDataSource() {
    if (this.dataSource === undefined)
      this.dataSource = new DataSource({
        type: 'cockroachdb',
        host: process.env.COCKROACH_DB_HOST,
        port: 26257,
        username: process.env.COCKROACH_DB_USER,
        password: process.env.COCKROACH_DB_PASSWORD,
        database: `${process.env.COCKROACH_DB_CLUSTER}.${process.env.PROJECT}`,
        ssl: true,
        extra: {
          options: `--cluster=${process.env.COCKROACH_DB_CLUSTER}`,
        },
        entities: this.entities,
        synchronize: false,
        logging: false,
        timeTravelQueries: false,
      });
    if (!this.dataSource.isInitialized) await this.dataSource.initialize();

    return this.dataSource;
  }

  public async getQueryRunner() {
    if (this.queryRunner === undefined || this.queryRunner.isReleased) {
      const ds = await this.getDataSource();
      this.queryRunner = ds.createQueryRunner();
      await this.queryRunner.connect();
    }

    return this.queryRunner;
  }

  public async cleanUp() {
    if (this.queryRunner !== undefined && !this.queryRunner.isReleased)
      await this.queryRunner.release();
    if (this.dataSource !== undefined && !this.dataSource.isInitialized)
      await this.dataSource.destroy();
  }
}
