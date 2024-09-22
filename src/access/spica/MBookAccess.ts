import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { MBook, MBookEntity } from 'src/model/entity/spica/MBookEntity';
import { Database } from 'src/util/Database';

/**
 * Access class for MBook model of spica.
 */
@injectable()
export class MBookAccess {
  @inject(Database)
  private readonly database!: Database;

  public async count(options?: FindManyOptions<MBook>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.count<MBook>(MBookEntity.name, options);
  }

  public async find(options?: FindManyOptions<MBook>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<MBook>(MBookEntity.name, options);
  }
}
