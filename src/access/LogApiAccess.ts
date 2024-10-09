import { inject, injectable } from 'inversify';
import { LogApi } from 'src/model/entity/LogApiEntity';
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
}
