import { getMysqlDb } from 'src/db/mysql';
import { saveApiLog } from 'src/logic/LoggerService';
import { QueueEvent } from 'src/model/Aws';

/** Consumes API-log messages from the other services. */
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
