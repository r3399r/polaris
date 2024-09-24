import { inject, injectable } from 'inversify';
import { DbAccess } from 'src/access/DbAccess';
import { MonitorAccess } from 'src/access/MonitorAccess';
import { MonitorHisAccess } from 'src/access/MonitorHisAccess';
import { MonitorHisEntity } from 'src/model/entity/MonitorHisEntity';
import { GoogleApiService } from './GoogleApiService';

/**
 * Service class for Monitor
 */
@injectable()
export class MonitorService {
  @inject(DbAccess)
  private readonly dbAccess!: DbAccess;

  @inject(MonitorAccess)
  private readonly monitorAccess!: MonitorAccess;

  @inject(MonitorHisAccess)
  private readonly monitorHisAccess!: MonitorHisAccess;

  @inject(GoogleApiService)
  private readonly googleApiService!: GoogleApiService;

  public async monitorAll() {
    const monitors = await this.monitorAccess.find();

    const LIMIT = 200;
    for (const m of monitors) {
      // check do refresh or not
      const currentHour = new Date().getHours();
      if (currentHour % Number(m.refreshPeriod) !== 0) continue;

      // query
      const startTimestamp = Date.now();
      const data = [];
      let offset = 0;
      while (true) {
        const rows = await this.dbAccess.query(
          `${m.sql} limit ${LIMIT} offset ${offset}`
        );
        data.push(...rows);
        offset = offset + LIMIT;
        if (rows.length === 0) break;
      }
      const elapsedTime = Date.now() - startTimestamp;

      if (data.length === 0) continue;
      const monitorHisEntity = new MonitorHisEntity();
      monitorHisEntity.name = m.name;
      monitorHisEntity.rowCount = data.length.toString();
      monitorHisEntity.elapsedTime = elapsedTime;
      await this.monitorHisAccess.save(monitorHisEntity);

      // save
      const sheet = await this.googleApiService.getSheet(m.name);
      await sheet.clear();
      await sheet.setHeaderRow(Object.keys(data[0]));
      await sheet.addRows(data);
    }
  }
}
