# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

`polaris` is the back-office/observability service of the **celestialstudio** stack.
It is a set of AWS Lambda functions (TypeScript, CommonJS, Node 24, arm64) deployed with
AWS SAM/CloudFormation. There is no HTTP API — every entry point is triggered by
EventBridge or SQS.

Three handlers, all exported from [src/index.ts](src/index.ts):

| Export | Trigger | Job |
| --- | --- | --- |
| `eventBridgeMonitor` | cron `1 0 * * ? *` | Runs the SQL stored in the CockroachDB `monitor` table and dumps results into a Google Sheet tab per monitor; records outcome in `monitor_his`. |
| `eventBridgeHouseKeeping` | cron `31 19 * * ? *` | Prunes `monitor_his` (14 days), `log_api` (3 months or 130k rows) and `ip` (3 months); optionally resets CockroachDB SQL stats. |
| `logger` | SQS (`${Project}-${TargetEnvr}-logger-queue`, batch 50) | Consumes API-log messages from the other services, enriches the caller IP via ip-api.com, writes `log_api` + `ip`. |
| `eventBridgeStopDb` | 05:00 & 19:00 Asia/Taipei, daily, **test env only** | Cost saving: stops the test MySQL RDS instance whenever it is found running. |

Two databases are involved: **CockroachDB** (`monitor`, `monitor_his`) and
**MySQL** (`log_api`, `ip`, shared `celestial-studio-${env}` instance).

## Layout

```
src/index.ts          lambda handlers — resolve from container, try/catch/finally, always clean up
src/bindings.ts        inversify container; every new class must be bound here
src/logic/*Service.ts  business logic
src/access/*Access.ts  one per table (+ CockroachDbAccess / MySqlDbAccess for raw SQL & transactions,
                       RdsAccess for the AWS RDS control plane)
src/util/*Database.ts  DataSource/QueryRunner lifecycle per engine
src/model/             plain types; src/model/entity/ holds TypeORM entities
db/*.sql               DDL, applied by hand (synchronize: false — no TypeORM migrations)
db/migration/          standalone one-off data-migration script, its own package.json
aws/cloudformation/template.yaml  all infrastructure
```

## Conventions

- **DI everywhere.** Classes are `@injectable()` with property injection
  (`@inject(Foo) private readonly foo!: Foo;`) — never constructor injection, never `new`
  a service. Register the class in [src/bindings.ts](src/bindings.ts) or `bindings.get()`
  will throw at runtime. Entities are registered with
  `.toFunction(XEntity)` against `cockroachDbEntitiesBindingId` / `mySqlDbEntitiesBindingId`.
- **Layering is strict:** handler → service → access → database util. Services must not
  touch a `QueryRunner` directly; access classes must not hold business rules.
- **Imports.** Use the `src/*` path alias for anything outside the current directory —
  `../*` is banned by ESLint (`no-restricted-imports`). Siblings use `./Foo`.
  Import order is enforced and alphabetised (`import/order`, `sort-imports`).
- **Braces.** `curly: ["error", "multi"]` — single-statement `if`/`else` bodies must have
  **no** braces. This is the opposite of the usual default; match the surrounding code.
- **`newline-before-return`** is an error, and arrow bodies must be
  `as-needed` (no `=> { return x; }`).
- **Entities** declare a `type` alias plus a class implementing it; snake_case columns are
  mapped with `name:`. Integer-ish columns are typed `string` in TS on purpose
  (`int8`/`int` coming back from the drivers) — keep that, don't "fix" it to `number`.
- Prettier: 80 cols, single quotes, 2 spaces, es5 trailing commas.
- Config comes from `process.env` only, read at point of use; every variable is wired in
  the CloudFormation template from SSM parameters. Never hardcode a secret or endpoint.
  `PRIVATE_KEY` stores newlines as `**` and is un-escaped in `GoogleApiService`.
- Lambdas are short-lived: a handler must `await db.cleanup()` in a `finally`, and the
  `logger` handler wraps its work in an explicit transaction.

## Commands

```sh
npm run lint          # eslint + prettier check (parallel)
npm run fix           # autofix both
npm test              # jest
npm run test:coverage
npm run pre:dev       # fix + test:coverage — run this before committing
npm run pre:deploy    # clean + build:lambda + build:layer (what deploy.sh runs)
```

Notes:
- `npm run pre:commit` is **broken** — it calls a `build` script that does not exist. Use
  `npm run pre:dev`, or `npm run lint && npm test && npm run pre:deploy`.
- `tsc` is invoked as `tspc` (ts-patch) so that `typescript-transform-paths` rewrites the
  `src/*` aliases in the emitted `lib/` output. Plain `tsc` produces unloadable Lambda code.
- `strict`, `noUnusedLocals`, `noUnusedParameters` and `noEmitOnError` are on; prefix
  deliberately unused params with `_`.
- **There are currently no test files.** `jest` matches `src/**/*.test.ts`, so new tests go
  next to the code they cover. If you add behaviour, add the test — mock the access layer,
  never hit a real database.

## Deploy & branches

- `deploy.sh <env>` packages and deploys stack `polaris-<env>-stack` to region `ap-east-2`.
- GitHub Actions: push to `dev` → `deploy.sh test`; push to `master` → `deploy.sh prod`.
  **Any commit on `dev` or `master` deploys.** Work on a `release-x.y.z` branch and open a
  PR, following the existing history (`release 1.1.4` bumps `package.json`, then PR into
  `dev`/`master`).
- Default working branch is `dev`; `master` is production.
- Changing an environment variable, schedule, memory or runtime means editing
  [aws/cloudformation/template.yaml](aws/cloudformation/template.yaml) — code alone is not enough.
- Schema changes are manual: add the DDL to `db/*.sql` **and** apply it to the real database;
  nothing runs it for you.

## Gotchas

- `MonitorService` appends `limit/offset` to operator-authored SQL from the `monitor` table
  and paginates until an empty page; `SQL_LIMIT` must be set and numeric or it throws.
- `CockroachDatabase.cleanUp()` / `MySqlDatabase.cleanUp()` destroy the DataSource only when
  `!isInitialized`, which is effectively never — the connection is intentionally left for
  container reuse. Don't "fix" this without checking Lambda warm-start behaviour.
- `GoogleApiService` caches the `GoogleSpreadsheet` in a singleton, so `loadInfo()` runs once
  per warm container. `getSheet` creates a missing tab and then re-reads `sheetsByTitle`,
  relying on `addSheet` refreshing that map — a sheet added out-of-band mid-container won't
  be seen.
- ip-api.com is a free unauthenticated endpoint with rate limits; IP lookups are skipped for
  IPs already in the `ip` table and failures are swallowed per record.
- `db/migration/` is a separate npm project with its own `.env` — don't add it to the root
  build, and don't commit `db/migration/.env`.
- The `stop-db` lambda exists only when `TargetEnvr` is `test` (CloudFormation condition
  `IsTestEnvr`) and has its own role whose `rds:StopDBInstance` is scoped to the single test
  instance ARN — two independent guards against ever stopping production. It derives the
  instance identifier from the first label of `MYSQL_DB_HOST`, and skips unless the status is
  exactly `available` (RDS rejects a stop during `backing-up`, `starting`, `modifying`, ...),
  so a skipped hour is normal and the next run picks it up.
- `stop-db` is scheduled with `AWS::Scheduler::Schedule`, not `AWS::Events::Rule` like the
  other two, so the hours can be written in local time
  (`ScheduleExpressionTimezone: Asia/Taipei`). The two schedule times are chosen around the
  owner's dev habits — 05:00 reclaims an instance left on overnight, 19:00 one left on after
  weekend daytime work — so they are intentionally expressed in Taipei time, not UTC. Keep
  them that way if you change the schedule. Scheduler invokes via `StopDbSchedulerRole`
  (identity-based), which is why there is no `AWS::Lambda::Permission` for it.
  `FlexibleTimeWindow.Mode` must stay quoted as `'OFF'` — bare `OFF` is boolean `false` in YAML.
- AWS force-starts a stopped RDS instance after 7 days; the twice-daily check caps the waste
  from that at about half a day.
