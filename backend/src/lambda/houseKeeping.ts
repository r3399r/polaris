import { getCockroachDb } from 'src/db/cockroach';
import { getMysqlDb } from 'src/db/mysql';
import { houseKeep } from 'src/logic/HouseKeepingService';

/**
 * Prunes monitor_his, log_api and ip. Both pools outlive the invocation, for
 * the same reason as in monitor.ts.
 */
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
