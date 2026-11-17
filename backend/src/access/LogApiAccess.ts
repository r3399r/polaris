import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { LogApi, LogApiEntity } from 'src/model/entity/LogApiEntity';
import { MySqlDatabase } from 'src/util/MySqlDatabase';

/**
 * Access class for LogApi model.
 */
@injectable()
export class LogApiAccess {
  @inject(MySqlDatabase)
  private readonly database!: MySqlDatabase;

  public async saveMany(data: LogApi[]) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.save(data);
  }

  public async createQueryBuilder() {
    const qr = await this.database.getQueryRunner();

    return qr.manager.createQueryBuilder(LogApiEntity.name, 'log_api');
  }

  public async count(options?: FindManyOptions<LogApi>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.count<LogApi>(LogApiEntity.name, { ...options });
  }

  public async find(options?: FindManyOptions<LogApi>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<LogApi>(LogApiEntity.name, { ...options });
  }
}
