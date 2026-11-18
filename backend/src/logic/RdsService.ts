import { describeDbInstance, stopDbInstance } from 'src/lib/rds';

/**
 * Stop the MySQL instance pointed at by MYSQL_DB_HOST if it is running.
 *
 * The instance identifier is the first label of the RDS endpoint, e.g.
 * celestial-studio-mysql-test.xxxx.ap-east-2.rds.amazonaws.com
 * -> celestial-studio-mysql-test
 *
 * RDS rejects a stop in any state other than `available`, so a skipped run is
 * normal and the next scheduled run picks the instance up.
 */
export const stopDb = async () => {
  const host = process.env.MYSQL_DB_HOST;
  if (!host) throw new Error('MYSQL_DB_HOST is not set');

  const identifier = host.split('.')[0];
  console.log(`checking db instance ${identifier}...`);

  const instance = await describeDbInstance(identifier);
  if (instance === undefined)
    throw new Error(`db instance ${identifier} not found`);

  const status = instance.DBInstanceStatus;
  if (status !== 'available') {
    console.log(`skip stopping ${identifier}, current status: ${status}`);

    return;
  }

  console.log(`stopping ${identifier}...`);
  await stopDbInstance(identifier);
  console.log(`${identifier} stop requested`);
};
