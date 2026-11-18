import axios from 'axios';
import {
  findIp,
  insertIps,
  insertLogApi,
  IpInsert,
  LogApiInsert,
  MysqlDb,
} from 'src/db/queries/mysql';
import { QueueEvent } from 'src/model/Aws';
import { Ip } from 'src/model/Ip';
import { LoggerInput } from 'src/model/Logger';

/**
 * ip-api.com is free and unauthenticated, so it is rate limited and answers
 * 200 with `status: 'fail'` rather than an http error.
 */
const getIpInfo = async (ip: string) => {
  const result = await axios.get<Ip>(
    `http://ip-api.com/json/${ip}?fields=1171481`
  );
  if (result.data.status === 'fail') throw new Error('ip-api failed');

  return result.data;
};

/**
 * Writes one log_api row per queue record, and an ip row for each caller ip
 * seen for the first time.
 *
 * A failed ip lookup is swallowed per record: the geo data is a nice-to-have
 * and the request log is not, so the log row is written either way.
 */
export const saveApiLog = async (db: MysqlDb, event: QueueEvent) => {
  const ipRows: IpInsert[] = [];
  const logRows: LogApiInsert[] = [];
  const ipSet = new Set<string>();

  for (const record of event.Records) {
    const data = JSON.parse(record.body) as LoggerInput;

    try {
      if (data.ip) {
        // ipSet dedupes within the batch; findIp covers earlier batches
        if (!ipSet.has(data.ip) && !(await findIp(db, data.ip))) {
          const ipInfo = await getIpInfo(data.ip);
          ipRows.push({
            ip: data.ip,
            continent: ipInfo.continent,
            country: ipInfo.country,
            region: ipInfo.regionName,
            city: ipInfo.city,
            mobile: ipInfo.mobile,
            dateCreated: new Date(),
          });
        }
        ipSet.add(data.ip);
      }
    } catch (e) {
      console.error(`Failed to fetch IP info for ${data.ip}:`, e);
    }

    logRows.push({
      project: data.project,
      resource: data.resource,
      path: data.path,
      httpMethod: data.httpMethod,
      queryStringParameters: data.queryStringParameters,
      body: data.body,
      statusCode: data.statusCode,
      elapsedTime: data.elapsedTime,
      version: data.version,
      ip: data.ip,
      // the payload carries an ISO string; MySQL's DATETIME literal is not ISO,
      // so the driver has to be handed a Date to format itself
      dateRequested: new Date(data.dateRequested),
      dateCreated: new Date(),
    });
  }

  if (ipRows.length > 0) await insertIps(db, ipRows);
  await insertLogApi(db, logRows);
};
