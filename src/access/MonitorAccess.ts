import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { Monitor, MonitorEntity } from 'src/model/entity/MonitorEntity';
import { CockroachDatabase } from 'src/util/CockroachDatabase';

/**
 * Access class for Monitor model.
 */
@injectable()
export class MonitorAccess {
  @inject(CockroachDatabase)
  private readonly database!: CockroachDatabase;

  public async find(options?: FindManyOptions<Monitor>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Monitor>(MonitorEntity.name, options);
  }
}
