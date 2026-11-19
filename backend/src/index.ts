import { handle } from 'hono/aws-lambda';
import { app } from './app';
import { getCockroachDb } from './db/cockroach';
import { getMysqlDb } from './db/mysql';
import { houseKeep } from './logic/HouseKeepingService';
import { saveApiLog } from './logic/LoggerService';
import { monitorAll } from './logic/MonitorService';
import { stopDb } from './logic/RdsService';
import { QueueEvent } from './model/Aws';

// No teardown in a finally anywhere below: each connection pool lives for the
// lifetime of the execution environment and is reused by warm invocations,
// which is what the TypeORM cleanUp() this replaces effectively did too -- it
// only ever released the query runner, never the DataSource.

export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  try {
    await monitorAll(getCockroachDb());
  } catch (e) {
    console.log(e);
  }
}

export async function eventBridgeHouseKeeping(
  _event: unknown,
  _context: unknown
) {
  try {
    await houseKeep(getCockroachDb(), getMysqlDb());
  } catch (e) {
    console.log(e);
  }
}

export async function logger(event: QueueEvent, _context: any) {
  console.log(event);
  try {
    // Throwing inside the callback rolls the transaction back. The error is
    // then swallowed rather than rethrown, deliberately: rethrowing would fail
    // the batch and SQS would redeliver it, and this queue has no DLQ and four
    // days of retention, so a poison message would retry for days.
    await getMysqlDb().transaction(async (tx) => await saveApiLog(tx, event));
  } catch (e) {
    console.error(e);
  }
}

export async function eventBridgeStopDb(_event: unknown, _context: unknown) {
  await stopDb();
}

/**
 * The http api. Everything it does is in src/app.ts; this is the adapter that
 * turns API Gateway's event into a Request and the Response back into a
 * result, so the app itself is testable without an event shape at all.
 *
 * The CloudFormation handler stays `index.api`, unchanged.
 */
export const api = handle(app);
