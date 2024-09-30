import { inject, injectable } from 'inversify';
import { LogApi, LogApiEntity } from 'src/model/entity/LogApiEntity';
import { Database } from 'src/util/Database';

/**
 * Access class for LogApi model.
 */
@injectable()
export class LogApiAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: LogApi) {
    const qr = await this.database.getQueryRunner();
    const entity = new LogApiEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
