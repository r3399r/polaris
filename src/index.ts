import { DbAccess } from './access/DbAccess';
import { bindings } from './bindings';
import { monitor } from './lambda/monitor';

export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
  await db.startTransaction();
  try {
    await monitor();
    await db.commitTransaction();
    await db.resetSqlStats();
  } catch (e) {
    console.log(e);
    await db.rollbackTransaction();
  } finally {
    await db.cleanup();
  }
}
