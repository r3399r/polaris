import {
  CockroachDb,
  findMonitors,
  insertMonitorHis,
  runRawQuery,
} from 'src/db/queries/cockroach';
import { getSheet } from 'src/lib/googleSheets';

/**
 * Runs every monitor's SQL and dumps the result into a Google Sheet tab named
 * after it, recording the outcome in monitor_his.
 *
 * NOTE on refreshPeriod: the check below compares `new Date().getHours()`,
 * which is local time and therefore UTC in Lambda, against the period. The
 * schedule fires at 00:01 UTC, so currentHour is always 0 and `0 % n === 0`
 * holds for every n -- every monitor runs every day whatever its configured
 * period. This is pinned by MonitorService.test.ts; changing it is a separate,
 * deliberate decision.
 */
export const monitorAll = async (db: CockroachDb) => {
  console.log('monitor starts...');
  const monitors = await findMonitors(db);
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
    const data: Record<string, unknown>[] = [];
    let offset = 0;

    try {
      while (true) {
        console.log(`querying ${m.name} with offset ${offset}...`);
        const rows = await runRawQuery(
          db,
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
      const sheet = await getSheet(m.name);
      if (m.append === false) await sheet.clear();
      await sheet.setHeaderRow(Object.keys(data[0]));
      await sheet.addRows(data as never);

      await insertMonitorHis(db, {
        name: m.name,
        rowCount: data.length,
        elapsedTime,
        success: true,
        dateCreated: new Date(),
      });
    } catch (e) {
      console.error(`Error monitoring ${m.name}:`, e);
      await insertMonitorHis(db, {
        name: m.name,
        rowCount: null,
        elapsedTime: null,
        success: false,
        dateCreated: new Date(),
      });
      continue;
    }
  }
};
