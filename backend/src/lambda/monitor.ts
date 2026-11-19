import { getCockroachDb } from 'src/db/cockroach';
import { monitorAll } from 'src/logic/MonitorService';

/**
 * Runs every monitor's SQL and writes the results to Google Sheets.
 *
 * No teardown in a `finally`: the connection pool lives for the lifetime of
 * the execution environment and is reused by warm invocations, which is what
 * the TypeORM `cleanUp()` this replaced effectively did too -- that only ever
 * released the query runner, never the DataSource.
 */
export async function eventBridgeMonitor(_event: unknown, _context: unknown) {
  try {
    await monitorAll(getCockroachDb());
  } catch (e) {
    console.log(e);
  }
}
