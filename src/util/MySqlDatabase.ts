import 'reflect-metadata';
import { injectable, multiInject } from 'inversify';
import { DataSource, QueryRunner } from 'typeorm';

export const mySqlDbEntitiesBindingId = Symbol('MySqlDbEntities');
/**
 * MySqlDatabase manager class
 */
@injectable()
export class MySqlDatabase {
  private dataSource: DataSource | undefined = undefined;
  private queryRunner: QueryRunner | undefined = undefined;

  @multiInject(mySqlDbEntitiesBindingId)
  private readonly entities!: Function[];

  private async getDataSource() {
    if (this.dataSource === undefined)
      this.dataSource = new DataSource({
        type: 'mysql',
        host: process.env.MYSQL_DB_HOST,
        port: 3306,
        username: process.env.PROJECT,
        password: process.env.MYSQL_DB_PASSWORD,
        database: process.env.PROJECT,
        entities: this.entities,
        synchronize: false,
        logging: false,
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
