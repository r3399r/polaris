import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import {
  MonitorHis,
  MonitorHisEntity,
} from 'src/model/entity/MonitorHisEntity';
import { Database } from 'src/util/Database';

/**
 * Access class for MonitorHis model.
 */
@injectable()
export class MonitorHisAccess {
  @inject(Database)
  private readonly database!: Database;

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

  public async hardDelete(options: FindManyOptions<MonitorHis>) {
    const qr = await this.database.getQueryRunner();
    const res = await qr.manager.find<MonitorHis>(
      MonitorHisEntity.name,
      options
    );
    await qr.manager.remove(res);
  }
}
