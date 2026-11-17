import { CockroachDbAccess } from './access/CockroachDbAccess';
import { MySqlDbAccess } from './access/MySqlDbAccess';
import { bindings } from './bindings';
import { HouseKeepingService } from './logic/HouseKeepingService';
import { LoggerService } from './logic/LoggerService';
import { MonitorService } from './logic/MonitorService';
import { RdsService } from './logic/RdsService';
import { FunctionUrlEvent, FunctionUrlResult, QueueEvent } from './model/Aws';
import { dbSwitchPage } from './util/DbSwitchPage';
import { secretMatches } from './util/Secret';

export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  const db = bindings.get(CockroachDbAccess);
  const service = bindings.get(MonitorService);
  try {
    await service.monitorAll();
  } catch (e) {
    console.log(e);
  } finally {
    await db.cleanup();
  }
}

export async function eventBridgeHouseKeeping(
  _event: unknown,
  _context: unknown
) {
  const cockroachDb = bindings.get(CockroachDbAccess);
  const mysqlDb = bindings.get(MySqlDbAccess);
  const service = bindings.get(HouseKeepingService);
  try {
    await service.houseKeep();
  } catch (e) {
    console.log(e);
  } finally {
    await cockroachDb.cleanup();
    await mysqlDb.cleanup();
  }
}

export async function logger(event: QueueEvent, _context: any) {
  console.log(event);
  const db = bindings.get(MySqlDbAccess);
  const service = bindings.get(LoggerService);
  await db.startTransaction();
  try {
    await service.saveApiLog(event);
    await db.commitTransaction();
  } catch (e) {
    console.error(e);
    await db.rollbackTransaction();
  } finally {
    await db.cleanup();
  }
}

export async function eventBridgeStopDb(_event: unknown, _context: unknown) {
  const service = bindings.get(RdsService);
  await service.stopDb();
}

const notFound: FunctionUrlResult = {
  statusCode: 404,
  headers: { 'content-type': 'text/plain' },
  body: 'not found',
};

const json = (body: unknown): FunctionUrlResult => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export async function dbSwitch(
  event: FunctionUrlEvent,
  _context: unknown
): Promise<FunctionUrlResult> {
  const secret = process.env.UI_SECRET;
  if (!secret) throw new Error('UI_SECRET is not set');

  // the whole path is the secret; anything else is indistinguishable from a
  // scan and must not reach the RDS api
  if (!secretMatches((event.rawPath ?? '').replace(/^\/+/, ''), secret))
    return notFound;

  const method = event.requestContext.http.method;
  if (method === 'GET')
    return {
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
      body: dbSwitchPage,
    };
  if (method !== 'POST') return notFound;

  const service = bindings.get(RdsService);
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');
  const action = (JSON.parse(raw || '{}') as { action?: string }).action;

  if (action === 'start') await service.startDb();
  else if (action === 'stop') await service.stopDb();
  else if (action !== 'status')
    return { statusCode: 400, body: 'unknown action' };

  return json(await service.getState());
}
