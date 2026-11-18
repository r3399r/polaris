/**
 * The local environment for the regression suite, applied before anything reads
 * process.env.
 *
 * `??=`, so an explicitly exported variable always wins:
 *
 *   MYSQL_DB_HOST=host.docker.internal npm run test:regression
 *
 * Two differences from castor's equivalent. It keeps these in a root
 * `localEnv.ts` that both this and its dev server import; polaris has no local
 * server, so there is one consumer and no reason to split the file -- and
 * importing `../localEnv` from here would trip the ESLint rule that bans `../`
 * imports anyway. It also reads a `.env.local` through dotenv, which polaris
 * does not need: every value below matches docker-compose.yml, and there is no
 * local secret to keep out of git (castor's file exists for its ECPay
 * credentials). The password here is the one already committed in
 * docker-compose.yml, for a database holding nothing but test rows.
 *
 * vitest.config.mts applies this to every run, not just the regression one.
 * That is harmless for the unit tests: they set whatever environment they care
 * about themselves, and `??=` never overrides it.
 *
 * Nothing deployed reads this. The Lambdas take their environment from
 * CloudFormation.
 */
process.env.PROJECT ??= 'polaris';

// MySQL: the container's 3306 is published on 3307, leaving 3306 to castor's
// own compose file so both repos can have a database up at once.
process.env.MYSQL_DB_HOST ??= '127.0.0.1';
process.env.MYSQL_DB_PORT ??= '3307';
process.env.MYSQL_DB_PASSWORD ??= 'polarislocal';

// CockroachDB single node, insecure: no TLS and no cluster routing. Leaving
// COCKROACH_DB_CLUSTER unset is what selects that mode in src/db/cockroach.ts.
process.env.COCKROACH_DB_HOST ??= '127.0.0.1';
process.env.COCKROACH_DB_PORT ??= '26258';
process.env.COCKROACH_DB_USER ??= 'root';
process.env.COCKROACH_DB_PASSWORD ??= '';

// MonitorService refuses to run without it.
process.env.SQL_LIMIT ??= '500';
