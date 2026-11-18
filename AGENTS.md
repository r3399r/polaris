# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

`polaris` is the back-office/observability service of the **celestialstudio** stack.
It holds two deployables in one repo:

- **`backend/`** — AWS Lambda functions (TypeScript, CommonJS, Node 24, arm64) deployed with
  AWS SAM/CloudFormation. There is no HTTP API — every entry point is triggered by
  EventBridge or SQS.
- **`webapp/`** — a Next.js static export (`output: 'export'`) served out of S3 through a
  CloudFront distribution at `polaris.celestialstudio.net`. It has **no backend of its own
  yet**: there is deliberately no API Gateway, so the page is static and calls nothing. When
  an api is added it becomes a second origin on that same distribution with an `/api/*`
  behavior, which keeps the browser's calls same-origin and means no CORS anywhere.

Four handlers, all exported from [backend/src/index.ts](backend/src/index.ts):

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
package.json               root; ONLY forwards scripts into backend/ (see the workspaces gotcha)
deploy.sh                  backend stack first, then the webapp export to S3
backend/src/index.ts       lambda handlers — get a db handle, call a service, catch
backend/src/logic/*Service.ts  business logic, exported as plain functions
backend/src/db/mysql.ts    getMysqlDb(): one drizzle/mysql2 pool per execution environment
backend/src/db/cockroach.ts  getCockroachDb(): the same, over the Postgres wire protocol
backend/src/db/schema/     drizzle table definitions, one file per engine
backend/src/db/queries/    every statement this service issues, one file per engine
backend/src/lib/           wrappers over outside services (AWS RDS, Google Sheets)
backend/src/model/         plain types for things crossing a boundary (sqs event, payloads)
backend/package.json       the deployed version number lives here, as it always has
backend/aws/cloudformation/template.yaml   ALL infrastructure, including the webapp's
                           S3 bucket, CloudFront distribution and Route53 record
webapp/app/                Next.js app router; page.tsx is the whole ui today
webapp/next.config.ts      output:'export' in production only, trailingSlash:true
db/*.sql                   DDL, applied by hand. There is no drizzle-kit and no migration
                           runner; db/schema/ only has to agree with these files
db/migration/              standalone one-off data-migration script, its own package.json
```

## Conventions

### Backend

- **No classes, no DI container.** Everything is a module exporting plain functions.
  There is no inversify, no `@injectable()`, no `bindings.ts` — a function that needs a
  database handle takes it as its first parameter, and the handler is the only place that
  calls `getMysqlDb()` / `getCockroachDb()`.
- **Every SQL statement lives in `src/db/queries/`.** Services never build a query; they
  call a named function from there. This is the one place polaris deliberately differs
  from `castor`, which writes drizzle queries inline in its routes — see the testing note
  in Commands for why.
- **Imports.** Use the `src/*` path alias for anything outside the current directory —
  `../*` is banned by ESLint (`no-restricted-imports`). Siblings use `./Foo`.
  Import order is enforced and alphabetised (`import/order`, `sort-imports`).
- **Braces.** `curly: ["error", "multi"]` — single-statement `if`/`else` bodies must have
  **no** braces. This is the opposite of the usual default; match the surrounding code.
- **`newline-before-return`** is an error, and arrow bodies must be
  `as-needed` (no `=> { return x; }`).
- **Schema** is declared in `src/db/schema/`, snake_case column names passed explicitly.
  Row and insert types come from drizzle (`typeof fooTable.$inferSelect` /
  `$inferInsert`) — do not hand-write them. Integer columns are `number` here; the old
  TypeORM entities typed them `string` because the drivers returned strings, and that is
  no longer true.
- **Every DATETIME takes a `Date`, never a string.** The columns are declared
  `mode: 'date'` so the mysql2 driver formats the value into MySQL's DATETIME literal
  syntax, which is not ISO 8601 — passing an ISO string fails with
  `ER_TRUNCATED_WRONG_VALUE`. There are no insert hooks either, so `date_created` has to
  be set at every call site.
- Prettier: 80 cols, single quotes, 2 spaces, es5 trailing commas.
- Config comes from `process.env` only, read at point of use; every variable is wired in
  the CloudFormation template from SSM parameters. Never hardcode a secret or endpoint.
  `PRIVATE_KEY` stores newlines as `**` and is un-escaped in `src/lib/googleSheets.ts`.
- **A handler never tears a connection down.** Each pool lives for the lifetime of the
  execution environment and is reused by warm invocations; `closeMysqlDb` /
  `closeCockroachDb` exist for tests only. The `logger` handler wraps its work in
  `getMysqlDb().transaction(...)`, which rolls back if the callback throws.

### Webapp

- Next.js app router, Tailwind 4, TypeScript strict. Nothing else: no component library, no
  chart library, no auth sdk. `castor/webapp` is the reference for how to add any of those
  when the time comes, but it is not a template to copy wholesale.
- Every route must be emitted as a directory with an `index.html` in it
  (`trailingSlash: true`), because the S3 website endpoint resolves a directory to its
  `IndexDocument`. Dropping that setting produces urls that 404 through CloudFront.

## Commands

From the repo root — these only forward into `backend/`:

```sh
npm run lint          # eslint + prettier check (parallel)
npm run fix           # autofix both
npm test              # jest
npm run test:coverage
npm run pre:dev       # fix + test:coverage — run this before committing
npm run pre:deploy    # clean + build:lambda + build:layer (what deploy.sh runs)
npm run dev:webapp    # next dev
npm run build:webapp  # static export into webapp/out
```

Notes:
- `backend`'s `pre:commit` script is **broken** — it calls a `build` script that does not
  exist. Use `npm run pre:dev`, or `npm run lint && npm test && npm run pre:deploy`.
- `tsc` is invoked as `tspc` (ts-patch) so that `typescript-transform-paths` rewrites the
  `src/*` aliases in the emitted `lib/` output. Plain `tsc` produces unloadable Lambda code.
- `strict`, `noUnusedLocals`, `noUnusedParameters` and `noEmitOnError` are on; prefix
  deliberately unused params with `_`.
- Tests live next to the code they cover; `jest` matches `backend/src/**/*.test.ts`, and
  `exclude` in [backend/tsconfig.json](backend/tsconfig.json) keeps them out of the Lambda
  bundle — without it `tspc` emits them into `lib/` and ships them. Coverage is the four
  services and nothing else.
- **Mock the query module, never a database.** `jest.mock('src/db/queries/mysql')` (or
  `.../cockroach`) and pass `{} as MysqlDb` as the handle — the queries are mocked, so it is
  never dereferenced. This is why every statement lives in `src/db/queries/` instead of
  inline in the services as `castor` writes them: `castor` covers its database code with
  regression tests against a real MySQL and keeps its unit tests to pure logic, which
  polaris has no equivalent of. Writing queries inline here would have left the services
  untestable without a live database.
- The `exclude` that keeps tests out of the bundle also takes them out of the TS project,
  so an editor shows "Cannot find name 'jest'" and unresolved `src/*` imports **in test
  files only**. jest resolves both itself; the red squiggles are cosmetic.
- Neither `deploy.sh` nor the GitHub workflows run lint or tests, so neither gates a
  release.

## Deploy & branches

- `deploy.sh <env>` deploys stack `polaris-<env>-stack` to region `ap-east-2`, then syncs
  `webapp/out` to `s3://polaris-<env>-y`. The backend goes first on purpose: a webapp
  calling a route the deployed backend does not have yet is the less bad failure.
- The site is `polaris.celestialstudio.net` (prod) and `polaris-test.celestialstudio.net`
  (test). The certificate is the shared `*.celestialstudio.net` one in **us-east-1** — a
  CloudFront certificate must live there whatever region the stack is in — and `castor` and
  `pollux` point at the same ARN.
- `deploy.sh` runs **no CloudFront invalidation**, and the default behavior is therefore
  pinned at TTL 0 with a `no-cache` header on upload. Adding a TTL means adding an
  invalidation with it. The hashed assets under `/_next/static/*` are the ones that could
  safely be cached long-term; that needs its own behavior plus matching headers in
  `deploy.sh`, and is not worth it for a single page.
- GitHub Actions: push to `dev` → `deploy.sh test`; push to `master` → `deploy.sh prod`.
  **Any commit on `dev` or `master` deploys.** Work on a `release-x.y.z` branch and open a
  PR, following the existing history (`release 1.1.4` bumps `backend/package.json`, then PR
  into `dev`/`master`).
- Default working branch is `dev`; `master` is production.
- Changing an environment variable, schedule, memory or runtime means editing
  [backend/aws/cloudformation/template.yaml](backend/aws/cloudformation/template.yaml) —
  code alone is not enough.
- Schema changes are manual: add the DDL to `db/*.sql` **and** apply it to the real database;
  nothing runs it for you.

## Gotchas

### Repo layout and local builds

- **This is NOT an npm workspace.** `backend`'s `build:layer` ships the Lambda layer by
  copying `backend/node_modules` wholesale; workspace hoisting would move those packages up
  to the root and the layer would deploy nearly empty — a stack that reports success and
  then throws `Cannot find module` on every invocation. `backend/` and `webapp/` each
  install their own tree, and the root `package.json` only forwards scripts. (Note this is
  not what `castor`'s layer is for: that one holds `chromium-arm64.zip` and nothing else,
  because castor bundles its app code with esbuild. Getting rid of polaris's layer means
  switching to bundling too, which is its own change.)
- There are **no native modules left**, so `npm i` and `npm run pre:deploy` both work on
  Windows. They used not to: `pg-native` pulled in `libpq`, which needs node-gyp and a
  Visual Studio install, and its leftovers also broke `build:layer`'s
  `cp -R node_modules dist/nodejs`. It was dropped along with TypeORM — `pg` is pure
  JavaScript and nothing requires the binding. Do not add it back.
- **`npm run pre:deploy` deletes your devDependencies.** `build:layer` runs
  `npm install --production` to prune the tree before copying it into the layer, so jest,
  eslint and tsc are gone afterwards and `npm test` fails until you `npm i` again. Harmless
  in CI, which is a fresh checkout; surprising locally.
- **`next build` fails if invoked from a lowercase drive letter** (`/c/Users/...`, as Git
  Bash reports it). React gets resolved twice, under `c:\` and `C:\`, and prerendering dies
  with `Cannot read properties of null (reading 'useContext')`. Build from PowerShell, or
  any shell whose cwd is `C:\Users\...`.
- **`.gitignore` anchors the build outputs to `backend/` on purpose.** A bare `lib` or
  `dist` pattern also matches anything of that name under `webapp/`, which would be source,
  and silently drops it from every commit — it still builds locally and then fails in CI.
  `db/migration` has its own `.gitignore` for its `dist`/`node_modules`/`.env`.

### Application behaviour

- `MonitorService` appends `limit/offset` to operator-authored SQL from the `monitor` table
  and paginates until an empty page; `SQL_LIMIT` must be set and numeric or it throws. That
  statement is run through `sql.raw` because the operator writes it — it cannot be
  parameterised, and a monitor whose SQL carries its own `limit` or a trailing semicolon
  breaks when the suffix is appended.
- **`MonitorService`'s `refreshPeriod` is inert.** The check is
  `new Date().getHours() % refreshPeriod`, `getHours()` is local time (UTC in Lambda), and
  the schedule fires at 00:01 UTC — so `currentHour` is always 0 and `0 % n === 0` for
  every n. Every monitor runs every day whatever its configured period. This is pinned by
  `MonitorService.test.ts`; changing it is a separate, deliberate decision.
- **A monitor whose query returns nothing writes no `monitor_his` row at all**, so "it ran
  and found nothing" and "it never ran" are indistinguishable in the history. Also pinned
  by a test.
- **`monitor_his` holds no business data** — only `row_count`, `elapsed_time` and
  `success`. The query results go straight to Google Sheets and are never stored, so
  anything that wants the data has to re-run `monitor.sql` or read the Sheet.
- **CockroachDB is not an officially supported drizzle target.** It is reached through
  `drizzle-orm/node-postgres` because it speaks the Postgres wire protocol. What makes that
  acceptable is how little it is asked to do: one select, one insert, raw SQL for the rest.
  The cluster is named twice in the connection — prefixed onto the database name *and* as
  the `--cluster` startup option — carried over from the TypeORM config, where both were
  set and the connection worked.
- **drizzle rejects an insert with an empty `VALUES` list**, where TypeORM's `save([])`
  silently did nothing. `insertLogApi` / `insertIps` guard for that, so call sites do not
  have to; a new insert helper needs the same guard.
- `findLogApiCutoff` and `findIp` have **hand-written return types** including `undefined`.
  `noUncheckedIndexedAccess` is off, so destructuring a drizzle result array gives TS a
  non-optional element and the inferred type would claim a row is always found. Both
  callers branch on its absence.
- `src/lib/googleSheets.ts` caches the `GoogleSpreadsheet` in a module singleton, so
  `loadInfo()` runs once per warm container. `getSheet` creates a missing tab and then
  re-reads `sheetsByTitle`, relying on `addSheet` refreshing that map — a sheet added
  out-of-band mid-container won't be seen.
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
