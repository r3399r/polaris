import { DbAccess } from './access/DbAccess';
import { bindings } from './bindings';
import { HouseKeepingService } from './logic/HouseKeepingService';
import { LoggerService } from './logic/LoggerService';
import { MonitorService } from './logic/MonitorService';
import { QueueEvent } from './model/Aws';

export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
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
  const db = bindings.get(DbAccess);
  const service = bindings.get(HouseKeepingService);
  try {
    await service.houseKeep();
  } catch (e) {
    console.log(e);
  } finally {
    await db.cleanup();
  }
}

export async function logger(event: QueueEvent, _context: any) {
  console.log(event);
  const db = bindings.get(DbAccess);
  const service = bindings.get(LoggerService);
  try {
    await service.saveApiLog(event);
  } catch (e) {
    console.error(e);
  } finally {
    await db.cleanup();
  }
}
