import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import {
  MonitorHis,
  MonitorHisEntity,
} from 'src/model/entity/MonitorHisEntity';
import { CockroachDatabase } from 'src/util/CockroachDatabase';

/**
 * Access class for MonitorHis model.
 */
@injectable()
export class MonitorHisAccess {
  @inject(CockroachDatabase)
  private readonly database!: CockroachDatabase;

  public async save(data: MonitorHis) {
    const qr = await this.database.getQueryRunner();
    const entity = new MonitorHisEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async find(options?: FindManyOptions<MonitorHis>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<MonitorHis>(MonitorHisEntity.name, options);
  }
}
