import { stopDb } from 'src/logic/RdsService';

/**
 * Cost saving: stops the test MySQL instance whenever it is found running.
 * This lambda exists only when TargetEnvr is `test`.
 */
export async function eventBridgeStopDb(_event: unknown, _context: unknown) {
  await stopDb();
}
