import { inject, injectable } from 'inversify';
import { FindOneOptions } from 'typeorm';
import { Ip, IpEntity } from 'src/model/entity/IpEntity';
import { MySqlDatabase } from 'src/util/MySqlDatabase';

/**
 * Access class for Ip model.
 */
@injectable()
export class IpAccess {
  @inject(MySqlDatabase)
  private readonly database!: MySqlDatabase;

  public async saveMany(data: Ip[]) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.save(data);
  }

  public async findOne(options?: FindOneOptions<Ip>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<Ip>(IpEntity.name, { ...options });
  }

  public async createQueryBuilder() {
    const qr = await this.database.getQueryRunner();

    return qr.manager.createQueryBuilder(IpEntity.name, 'ip');
  }
}
