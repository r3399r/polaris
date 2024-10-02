import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { LogApi, LogApiEntity } from 'src/model/entity/LogApiEntity';
import { Database } from 'src/util/Database';

/**
 * Access class for LogApi model.
 */
@injectable()
export class LogApiAccess {
  @inject(Database)
  private readonly database!: Database;

  public async saveMany(data: LogApi[]) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.save(data);
  }

  public async hardDelete(options: FindManyOptions<LogApi>) {
    const qr = await this.database.getQueryRunner();
    const res = await qr.manager.find<LogApi>(LogApiEntity.name, options);
    await qr.manager.remove(res);
  }
}
