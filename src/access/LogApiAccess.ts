import { inject, injectable } from 'inversify';
import { LogApi } from 'src/model/entity/LogApiEntity';
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
}
