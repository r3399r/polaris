import { CockroachDbAccess } from './access/CockroachDbAccess';
import { MySqlDbAccess } from './access/MySqlDbAccess';
import { bindings } from './bindings';
import { HouseKeepingService } from './logic/HouseKeepingService';
import { LoggerService } from './logic/LoggerService';
import { MonitorService } from './logic/MonitorService';
import { QueueEvent } from './model/Aws';

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
