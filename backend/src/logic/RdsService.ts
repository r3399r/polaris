import {
  describeDbInstance,
  startDbInstance,
  stopDbInstance,
} from 'src/lib/rds';
import { DbState } from 'src/model/Db';

/**
 * Whether this environment may act on its instance at all. Only the test
 * environment may; the production site shows its own database's status and
 * nothing more.
 *
 * Note the polarity: anything that is not exactly `test` is read-only, so an
 * unset or misspelled TARGET_ENVR fails safe. The binding guard is IAM -- the
 * prod api's role has `rds:DescribeDBInstances` and nothing else -- and this is
 * what lets the ui say *why* the buttons are dead rather than just greying them
 * out, which would be indistinguishable from a transition.
 */
export const isReadOnly = () => process.env.TARGET_ENVR !== 'test';

/**
 * The instance identifier is the first label of the RDS endpoint, e.g.
 * celestial-studio-mysql-test.xxxx.ap-east-2.rds.amazonaws.com
 * -> celestial-studio-mysql-test
 */
const getIdentifier = () => {
  const host = process.env.MYSQL_DB_HOST;
  if (!host) throw new Error('MYSQL_DB_HOST is not set');

  return host.split('.')[0];
};

const getStatus = async (identifier: string) => {
  const instance = await describeDbInstance(identifier);
  if (instance === undefined)
    throw new Error(`db instance ${identifier} not found`);

  return instance.DBInstanceStatus ?? 'unknown';
};

/**
 * RDS only accepts a start from `stopped` and a stop from `available`, and
 * rejects either during a transition (`starting`, `stopping`, `backing-up`,
 * `modifying`, ...). canStart/canStop say which call will actually be accepted,
 * so the ui can disable the other rather than show an error.
 */
export const getState = async (): Promise<DbState> => {
  const identifier = getIdentifier();
  const status = await getStatus(identifier);
  const readOnly = isReadOnly();

  return {
    identifier,
    status,
    canStart: !readOnly && status === 'stopped',
    canStop: !readOnly && status === 'available',
    readOnly,
  };
};

export const startDb = async () => {
  const identifier = getIdentifier();
  console.log(`checking db instance ${identifier}...`);

  const status = await getStatus(identifier);
  if (status !== 'stopped') {
    console.log(`skip starting ${identifier}, current status: ${status}`);

    return;
  }

  console.log(`starting ${identifier}...`);
  await startDbInstance(identifier);
  console.log(`${identifier} start requested`);
};

/**
 * Stop the MySQL instance pointed at by MYSQL_DB_HOST if it is running. A
 * skipped run is normal -- the scheduled check fires twice a day and the next
 * one picks the instance up.
 */
export const stopDb = async () => {
  const identifier = getIdentifier();
  console.log(`checking db instance ${identifier}...`);

  const status = await getStatus(identifier);
  if (status !== 'available') {
    console.log(`skip stopping ${identifier}, current status: ${status}`);

    return;
  }

  console.log(`stopping ${identifier}...`);
  await stopDbInstance(identifier);
  console.log(`${identifier} stop requested`);
};
