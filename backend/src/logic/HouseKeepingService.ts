import {
  CockroachDb,
  deleteOldMonitorHis,
  resetSqlStats,
} from 'src/db/queries/cockroach';
import {
  countLogApi,
  deleteIpOlderThanThreeMonths,
  deleteLogApiBefore,
  deleteLogApiOlderThanThreeMonths,
  findLogApiCutoff,
  MysqlDb,
} from 'src/db/queries/mysql';

/** log_api is capped by row count as well as by age. */
const LOG_API_ROW_LIMIT = 130000;

export const houseKeep = async (cockroachDb: CockroachDb, mysqlDb: MysqlDb) => {
  // clean cockroach db
  if (process.env.RESET_SQL_STATS === 'true') await resetSqlStats(cockroachDb);

  // clean monitor history
  await deleteOldMonitorHis(cockroachDb);

  // clean log of api. Over the cap, age stops mattering and the oldest rows go
  // whatever their date; under it, the three-month sweep is the only rule.
  // Note the gap this preserves: over the cap with no cutoff row found, nothing
  // is deleted at all, not even by age.
  const logCount = await countLogApi(mysqlDb);
  if (logCount > LOG_API_ROW_LIMIT) {
    const cutoff = await findLogApiCutoff(mysqlDb, LOG_API_ROW_LIMIT);
    if (cutoff !== undefined) await deleteLogApiBefore(mysqlDb, cutoff);
  } else await deleteLogApiOlderThanThreeMonths(mysqlDb);

  // clean ip
  await deleteIpOlderThanThreeMonths(mysqlDb);
};
