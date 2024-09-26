import { DbAccess } from './access/DbAccess';
import { bindings } from './bindings';
import { monitor } from './lambda/monitor';

export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
  try {
    await monitor();
  } catch (e) {
    console.log(e);
  } finally {
    await db.cleanup();
  }
}
