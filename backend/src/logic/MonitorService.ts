import { inject, injectable } from 'inversify';
import { CockroachDbAccess } from 'src/access/CockroachDbAccess';
import { MonitorAccess } from 'src/access/MonitorAccess';
import { MonitorHisAccess } from 'src/access/MonitorHisAccess';
import { MonitorHisEntity } from 'src/model/entity/MonitorHisEntity';
import { GoogleApiService } from './GoogleApiService';

/**
 * Service class for Monitor
 */
@injectable()
export class MonitorService {
  @inject(CockroachDbAccess)
  private readonly dbAccess!: CockroachDbAccess;

  @inject(MonitorAccess)
  private readonly monitorAccess!: MonitorAccess;

  @inject(MonitorHisAccess)
  private readonly monitorHisAccess!: MonitorHisAccess;

  @inject(GoogleApiService)
  private readonly googleApiService!: GoogleApiService;

  public async monitorAll() {
    console.log('monitor starts...');
    const monitors = await this.monitorAccess.find();
    console.log(monitors.length, 'monitors found');

    const LIMIT = Number(process.env.SQL_LIMIT);
    if (isNaN(LIMIT)) throw new Error('SQL_LIMIT is not a number');

    for (const m of monitors) {
      console.log(`monitoring ${m.name}...`);

      // check do refresh or not
      const currentHour = new Date().getHours();
      if (currentHour % Number(m.refreshPeriod) !== 0) {
        console.log(`skipping ${m.name} as it is not time to refresh`);
        continue;
      }

      // query
      const startTimestamp = Date.now();
      const data = [];
      let offset = 0;

      try {
        while (true) {
          console.log(`querying ${m.name} with offset ${offset}...`);
          const rows = await this.dbAccess.query(
            `${m.sql} limit ${LIMIT} offset ${offset}`
          );
          data.push(...rows);
          offset = offset + LIMIT;
          if (rows.length === 0) break;
        }
        const elapsedTime = Date.now() - startTimestamp;

        console.log(
          `querying ${m.name} with ${data.length} data completed in ${elapsedTime} ms`
        );
        if (data.length === 0) continue;

        // save
        console.log(`saving ${data.length} rows to Google Sheet...`);
        const sheet = await this.googleApiService.getSheet(m.name);
        if (m.append === false) await sheet.clear();
        await sheet.setHeaderRow(Object.keys(data[0]));
        await sheet.addRows(data);

        const monitorHisEntity = new MonitorHisEntity();
        monitorHisEntity.name = m.name;
        monitorHisEntity.rowCount = data.length.toString();
        monitorHisEntity.elapsedTime = elapsedTime;
        monitorHisEntity.success = true;
        await this.monitorHisAccess.save(monitorHisEntity);
      } catch (e) {
        console.error(`Error monitoring ${m.name}:`, e);
        const monitorHisEntity = new MonitorHisEntity();
        monitorHisEntity.name = m.name;
        monitorHisEntity.success = false;
        await this.monitorHisAccess.save(monitorHisEntity);
        continue;
      }
    }
  }
}
