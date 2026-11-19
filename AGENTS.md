# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

`polaris` is the back-office/observability service of the **celestialstudio** stack.
It holds two deployables in one repo:

- **`backend/`** — AWS Lambda functions (TypeScript, CommonJS, Node 24, arm64) deployed with
  AWS SAM/CloudFormation. Most entry points are EventBridge or SQS; there is also one small
  HTTP api.
- **`webapp/`** — a Next.js static export (`output: 'export'`) served out of S3 through a
  CloudFront distribution at `polaris.celestialstudio.net`. The api is a **second origin on
  that same distribution**, on an `/api/*` behavior, so the browser only ever talks to one
  hostname: there is no CORS configuration anywhere, and no public api url to find.

Five handlers, one per file in [backend/src/lambda/](backend/src/lambda/), each bundled
on its own:

| Export | Trigger | Job |
| --- | --- | --- |
| `eventBridgeMonitor` | cron `1 0 * * ? *` | Runs the SQL stored in the CockroachDB `monitor` table and dumps results into a Google Sheet tab per monitor; records outcome in `monitor_his`. |
| `eventBridgeHouseKeeping` | cron `31 19 * * ? *` | Prunes `monitor_his` (14 days), `log_api` (3 months or 130k rows) and `ip` (3 months); optionally resets CockroachDB SQL stats. |
| `logger` | SQS (`${Project}-${TargetEnvr}-logger-queue`, batch 50) | Consumes API-log messages from the other services, enriches the caller IP via ip-api.com, writes `log_api` + `ip`. |
| `eventBridgeStopDb` | 05:00 & 19:00 Asia/Taipei, daily, **test env only** | Cost saving: stops the test MySQL RDS instance whenever it is found running. |
| `api` | API Gateway REST api, `/{proxy+}` ANY | The webapp's backend. A Hono app ([backend/src/app.ts](backend/src/app.ts)) behind `hono/aws-lambda`'s `handle()`; the lambda export is three words long. `GET /api/db` reports **its own environment's** MySQL instance; `POST /api/db/start` and `/stop` act on it, and answer 403 outside the test environment. Every request needs `Authorization: Bearer <UI_SECRET>`. |

Two databases are involved: **CockroachDB** (`monitor`, `monitor_his`) and
**MySQL** (`log_api`, `ip`, shared `celestial-studio-${env}` instance).

## Layout

```
package.json               root; ONLY forwards scripts into backend/ (see the workspaces gotcha)
deploy.sh                  backend stack first, then the webapp export to S3
backend/src/lambda/        one entry per lambda — get a db handle, call a service, catch.
                           Each is bundled separately, so the entry decides what ships
backend/src/app.ts         the http api: one Hono app, its middleware, routes and onError
backend/src/routes/db.ts   its only route group, mounted at /api/db
backend/src/middleware/    bearerAuth (the UI_SECRET check) and noStore
backend/src/logic/*Service.ts  business logic, exported as plain functions
backend/src/db/mysql.ts    getMysqlDb(): one drizzle/mysql2 pool per execution environment
backend/src/db/cockroach.ts  getCockroachDb(): the same, over the Postgres wire protocol
backend/src/db/schema/     drizzle table definitions, one file per engine
backend/src/db/queries/    every statement this service issues, one file per engine
backend/src/lib/           wrappers over outside services (AWS RDS, Google Sheets,
                           ip-api) plus secret.ts, the constant-time comparison,
                           and errorResponse.ts, what a thrown error becomes
backend/src/model/         plain types for things crossing a boundary (sqs event, payloads)
backend/src/model/Db.ts    dbStateSchema — the zod schema GET /api/db answers with
backend/src/model/error/   HttpError and the two subclasses the api throws
backend/tools/build.ts     esbuild: src/lambda/<name>.ts -> dist/<name>/index.js, one per
                           lambda. Where the external list and the no-minify call live
backend/tools/openapi.ts   generates openapi.json from the routes; run by npm run openapi
backend/openapi.json       the generated document, COMMITTED; CI fails if it is stale
backend/regression/        database-backed tests; setup.ts also holds the local environment
backend/docker-compose.yml MySQL + CockroachDB for those tests, started with db:up
backend/package.json       the deployed version number lives here, as it always has
backend/aws/cloudformation/template.yaml   ALL infrastructure, including the webapp's
                           S3 bucket, CloudFront distribution and Route53 record
webapp/app/                Next.js app router; page.tsx is the only route today
webapp/components/         PasswordGate (the password screen) and DbCard (the status card)
webapp/lib/api.ts          the only module that calls the api; lib/secret.ts the only one
                           that touches localStorage
webapp/.env.local.example  DEV_API_ORIGIN, for the dev-only /api/* proxy. .env.local itself
                           is git-ignored
webapp/types/api.ts        the webapp's view of the api: aliases into the generated types
webapp/types/openapi.d.ts  generated from backend/openapi.json, NOT committed
webapp/next.config.ts      output:'export' in production only, trailingSlash:true, and a
                           dev-only /api/* proxy
webapp/eslint.config.mjs   Next's config plus the same house rules backend/ enforces
webapp/prettierrc.json     a copy of backend/prettierrc.json; .prettierignore beside it
db/*.sql                   DDL, applied by hand. There is no drizzle-kit and no migration
                           runner; db/schema/ only has to agree with these files
db/migration/              standalone one-off data-migration script, its own package.json
```

## Conventions

### Backend

- **No classes, no DI container.** Everything is a module exporting plain functions.
  There is no inversify, no `@injectable()`, no `bindings.ts` — a function that needs a
  database handle takes it as its first parameter, and the handler is the only place that
  calls `getMysqlDb()` / `getCockroachDb()`. The single exception is `src/model/error/`:
  `extends Error` is the only way to get an `instanceof` check, and that check is how
  `lib/errorResponse.ts` tells a status the api meant to answer from a bug.
- **The api is a Hono app, not a router in the handler.** `src/app.ts` mounts the
  middleware and the route groups and ends in one `.onError`; `src/lambda/api.ts`
  exports `handle(app)` and nothing else. A route group is a `new Hono()` chain in
  `src/routes/`, mounted at its full path (`/api/db`) — same shape as `castor`.
  A route answers by throwing: `UnauthorizedError`, `ForbiddenError`, or anything else,
  which becomes a bare 500 with the message dropped. Nothing writes a status by hand.
- **A response schema is a zod schema in `src/model/`, and the type comes off it**
  (`z.infer`). `castor` keeps its response schemas in the route file, because `castor`
  has no service layer — its queries sit in the route. polaris has one, and a service
  that imported a route to name its own return type would have the layering backwards.
  `.describe()` on a field is not a comment: it reaches the generated OpenAPI document.
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
- **`lib/api.ts` is the only module that calls `fetch`, and `lib/secret.ts` the only one
  that touches `localStorage`.** Both are small on purpose: they are the whole of what a
  component could get wrong about the contract, and the webapp has no test runner to catch
  it if one did.
- **No type the api sends is written by hand** — everything comes through
  `types/api.ts`, which aliases the generated `types/openapi.d.ts`. A component that needs
  a new field waits for the backend schema to have it.
- **Paths to the api are relative and have no trailing slash.** One hostname, one
  distribution, so `/api/db` is simply there; hono matches exactly, so `/api/db/` is a 404.
- **The lint rules are the backend's plus Next's.** `curly: multi`, `arrow-body-style`,
  `newline-before-return`, alphabetised `import/order` and the `../*` ban are all copied
  from [backend/eslint.config.mjs](backend/eslint.config.mjs), so one repo does not hold
  two opinions about braces; `next/core-web-vitals` and `next/typescript` add the
  react-hooks rules and the framework's own checks, which the backend has no use for.
  Prettier's config is a **copy** of the backend's, not a reference to it -- neither
  package can see the other's files, and neither is a workspace.

## Commands

From the repo root — these only forward into `backend/`:

```sh
npm run lint          # eslint + prettier check (parallel)
npm run fix           # autofix both
npm run typecheck     # tsc --noEmit over tsconfig.json AND tsconfig.tools.json
npm test              # vitest: the unit tests, then the regression suite
npm run test:coverage
npm run pre:dev       # fix + test:coverage — run this before committing
npm run pre:deploy    # clean + typecheck + build (what deploy.sh runs)
npm run dev:webapp    # next dev. Copy webapp/.env.local.example to .env.local first,
                      # or /api/* has nothing behind it locally
npm run build:webapp  # static export into webapp/out
npm run lint:webapp   # eslint + prettier check over webapp/. The unsuffixed lint/fix/
npm run fix:webapp    # typecheck scripts are backend-only, as they always have been
npm run typecheck:webapp
```

Also forwarded, for the api document:

```sh
npm run openapi       # regenerate openapi.json from the routes. Commit the result
```

In `webapp/`, usually not by hand — `postinstall`, `predev`, `prebuild` and
`pretypecheck` all run it, so a stale copy cannot survive anything you would do before
noticing:

```sh
npm run api:types     # backend/openapi.json -> types/openapi.d.ts
```

In `backend/`, not forwarded because they need Docker:

```sh
npm run db:up           # MySQL + CockroachDB, schema loaded from db/*.sql
npm run db:down         # and gone. No volumes, so this pair is the reset
npm run test:unit       # vitest run --dir src
npm run test:regression # vitest run --dir regression -- db:up has to be up
```

Notes:
- `backend`'s `pre:commit` works again. It calls `build`, which did not exist while the
  Lambda build was `build:lambda` + `build:layer`; now it does. `npm run pre:dev` is still
  the lighter one to run before committing.
- **A `git checkout` of a file used to be enough to make `lint:format` fail on it.**
  Everything in this repository is stored with LF and prettier is configured for LF, but
  git's local config here has `core.autocrlf=true`, which rewrote text files to CRLF on
  checkout — and `git diff` showed nothing, because git normalises before comparing. The
  `.gitattributes` at the root (`* text=auto eol=lf`) pins it, and also protects
  `deploy.sh`, which a Linux runner cannot execute with carriage returns in it. If an
  existing working tree still shows phantom modifications, `git add --renormalize .` once
  clears them. Do not "fix" this by converting files — the blobs are already LF.
- **`tsc` only ever typechecks; it emits nothing.** esbuild produces the deployed code and
  resolves the `src/*` aliases itself, from `paths` in `tsconfig.json`. That is what
  replaced `tspc` (ts-patch) and `typescript-transform-paths`, which existed solely to
  rewrite those aliases in the emitted `lib/`.
- `strict`, `noUnusedLocals`, `noUnusedParameters` and `noEmitOnError` are on; prefix
  deliberately unused params with `_`.
- **The test runner is vitest**, as in `castor`, and `globals` is off — every test file
  imports `describe`/`it`/`expect`/`vi` from `'vitest'` explicitly. Tests live next to the
  code they cover (`vitest run --dir src`), and `exclude` in
  [backend/tsconfig.json](backend/tsconfig.json) still excludes them, now only by
  inheritance — a bundle reaches what its entry imports, so a test file cannot ship
  whatever the project includes. That `exclude` is also why
  [backend/tsconfig.tools.json](backend/tsconfig.tools.json) exists: the tests have no
  project of their own otherwise, so the `src/*` alias would not resolve in them.
  `vite-tsconfig-paths` is pointed at that file and `npm run typecheck` checks both.
- **Mock the query module, never a database.** `vi.mock('src/db/queries/mysql')` (or
  `.../cockroach`) and pass `{} as MysqlDb` as the handle — the queries are mocked, so it is
  never dereferenced. This is why every statement lives in `src/db/queries/` instead of
  inline in the services as `castor` writes them: `castor` covers its database code with
  regression tests against a real MySQL and keeps its unit tests to pure logic, which
  polaris has no equivalent of. Writing queries inline here would have left the services
  untestable without a live database.
- **Never `vi.mock()` a node_modules package.** Vite pre-bundles dependencies and the mock
  registry is keyed by resolved id, so the mock silently fails to apply — and the failure
  is worse than consistent: it passes when the file runs alone, and with a warm
  `node_modules/.vite` cache it passes in the suite too, so only a cold cache (i.e. CI)
  shows it. `vi.mock` a module under `src/` instead; `src/lib/ipApi.ts` exists only so the
  ip-api call has such a module to live in. If a suite result looks suspicious, delete
  `node_modules/.vite` and run again.
- **The regression suite talks to real databases**, started by `npm run db:up` from
  `backend/`. It calls the service functions against them and reads the rows back — which
  is the only way to check what the unit tests cannot: that a `Date` survives a
  `DATETIME(3)` round trip, that the raw `DATE_SUB` fragments are valid SQL, that the
  row-cap cutoff query picks the right row, that `boolean()` maps to `tinyint(1)`, and that
  `logger`'s transaction really does roll the ip row back when the log insert fails.
  Google Sheets, ip-api and the AWS sdk stay mocked in it; everything else is real.
- **The regression suite does not prove the CockroachDB Cloud connection works.** A local
  `start-single-node --insecure` needs no TLS and no `--cluster` routing, so that code path
  — the riskiest part of the drizzle migration — is only exercised by a real deploy.
  Neither is the suite in CI yet; `castor` has not done that half either.
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
- GitHub Actions: push to `dev` → `deploy.sh test`; push to `master` → `deploy.sh prod`,
  each behind the `checks` job. **Any commit on `dev` or `master` deploys.** Work on a `release-x.y.z` branch and open a
  PR, following the existing history (`release 1.1.4` bumps `backend/package.json`, then PR
  into `dev`/`master`).
- Default working branch is `dev`; `master` is production.
- Changing an environment variable, schedule, memory or runtime means editing
  [backend/aws/cloudformation/template.yaml](backend/aws/cloudformation/template.yaml) —
  code alone is not enough.
- Schema changes are manual: add the DDL to `db/*.sql` **and** apply it to the real database;
  nothing runs it for you.
- **A release is gated now**, which it never used to be. Both workflows call
  [.github/workflows/checks.yml](.github/workflows/checks.yml) and `needs:` it, so a
  failure stops the deploy: backend typecheck, lint, unit tests, the openapi staleness
  check, and the webapp's typecheck and lint. It is a reusable workflow rather than steps copied
  into both files because two copies of a gate drift, and the half that drifts is always
  the one guarding production. Everything in it runs **before** the AWS credentials step,
  so a release either stops before touching anything or runs to the end.
  `deploy.sh` itself still runs no checks, and the regression suite is still not in CI —
  it needs MySQL and CockroachDB as service containers, which is its own change.
- The `checks` job uses `actions/checkout@v4` and `setup-node@v4`; the deploy jobs are
  still on `@v2`/`@v3` and `configure-aws-credentials@v1`. Bumping those is a separate
  change, since it touches the step that actually deploys.

## Gotchas

### Repo layout and local builds

- **This is not an npm workspace, but the reason it could not be is gone.** It used to be
  fatal: `build:layer` shipped a Lambda layer by copying `backend/node_modules` wholesale,
  and workspace hoisting would have moved those packages to the root and deployed the layer
  nearly empty — a stack that reports success and then throws `Cannot find module` on every
  invocation. There is no layer and no `node_modules` copy any more. `backend/` and
  `webapp/` still install their own tree and the root `package.json` still only forwards
  scripts; converting them is now merely a change nobody has made, not one that would
  break the deploy.
- There are **no native modules left**, so `npm i` and `npm run pre:deploy` both work on
  Windows. They used not to: `pg-native` pulled in `libpq`, which needs node-gyp and a
  Visual Studio install, and its leftovers also broke the `cp -R node_modules dist/nodejs`
  the layer build did. It was dropped along with TypeORM — `pg` is pure JavaScript and
  nothing requires the binding. Do not add it back; esbuild cannot bundle a `.node` binary
  either.
- **`npm run pre:deploy` no longer deletes your devDependencies.** It used to: `build:layer`
  ran `npm install --production` to prune the tree before copying it into the layer, so
  eslint and vitest were gone afterwards and `npm test` failed until you `npm i` again.
  Nothing prunes anything now.
- **The Windows drive letter's case matters, twice.** `next build` fails outright if
  invoked from a lower-case drive letter (`/c/Users/...`, as Git Bash reports it): React
  gets resolved twice, under `c:\` and `C:\`, and prerendering dies with
  `Cannot read properties of null (reading 'useContext')`. Build the webapp from
  PowerShell, or any shell whose cwd is `C:\Users\...`. On the backend the same split
  spelling breaks vitest's coverage silently instead — the v8 provider keeps only results
  under its root, so a lower-case root reports 0% while every test passes — which is why
  [backend/vitest.config.mts](backend/vitest.config.mts) forces the root's drive letter
  upper case. Taken from `castor`, which diagnosed it.
- `vitest.config` is **`.mts`, not `.ts`**: the package is CommonJS (the Lambda build needs
  it), and vite warns on every run about ESM syntax in a config loaded as CommonJS. It also
  deliberately does not import from `'vite'` — those types are only reachable under
  `moduleResolution` `node16`/`nodenext`/`bundler`, and `tsconfig.json` is on classic
  `node`, so `npm run typecheck` would fail on the config file.
- **`.gitignore` anchors the build outputs to `backend/` on purpose.** A bare `lib` or
  `dist` pattern also matches anything of that name under `webapp/`, which would be source,
  and silently drops it from every commit — it still builds locally and then fails in CI.
  `db/migration` has its own `.gitignore` for its `dist`/`node_modules`/`.env`.

### The Lambda build

- **One esbuild bundle per lambda, and that is the whole point.** `tools/build.ts` turns
  each `src/lambda/<name>.ts` into `dist/<name>/index.js`, and each function's `CodeUri`
  points at its own directory. A shared entry would make every function carry the union of
  what all five import -- measured: re-exporting the five handlers from one `index.ts`
  gives five 5-6MB bundles, while separate entries give 1.5-2.4MB each. The `Handler:`
  values did not change and do not need to: the export name is the same, only `CodeUri`
  moved.
- **This replaced a Lambda layer that was nothing but `node_modules`.** 36.9MB and 90
  packages on every function, `@types` included. `castor`'s layer is a different thing --
  it holds `chromium-arm64.zip`, which is genuinely a layer's job.
- **Six packages must stay `external` or the build does not start.** `hono-openapi` reaches
  for optional schema adapters through `@standard-community/standard-json`:
  `importIfInstalled(() => import('zod-to-json-schema'))`. The guard is a *runtime* one,
  but esbuild resolves a dynamic import at *build* time and errors on a package that is
  not installed. None of them is wanted -- zod 4 converts its own schemas -- so they are
  listed in `EXTERNAL` in `tools/build.ts`, where the comment explains it. If a dependency
  bump adds another such adapter, the build fails loudly rather than shipping something
  broken.
- **Nothing is minified, which is where this differs from `castor`.** Minifying saves about
  1.3MB a function and costs every CloudWatch stack trace its line numbers. Buying those
  back with a sourcemap costs more than not minifying did -- a 4MB map against a 1.3MB
  saving -- plus `NODE_OPTIONS=--enable-source-maps` on every function. polaris is the
  service you read logs *in*.
- Adding a lambda means three things, not one: an entry in `src/lambda/`, an entry in
  `ENTRIES` in `tools/build.ts`, and a function in the template pointing at
  `../../dist/<name>`.
- **esbuild's version is pinned by vitest, not by this build.** `vite` (under `vitest`)
  declares esbuild as a `peerOptional` in a narrow range -- `^0.27 || ^0.28` at the time of
  writing -- and before this change there was no esbuild in the tree at all, so vite ran
  without one. Installing one outside that range resolves, hoists to the top of
  `node_modules`, and hands vite a version it does not support. `npm uninstall` is what
  surfaces it, as an `ERESOLVE` that names vite rather than esbuild. Keep the two in the
  same range; bumping esbuild past what vite accepts means bumping vitest with it.

### The api

- **The SSM parameter `polaris-ui-secret` must exist before either stack can deploy.**
  `LambdaApi` resolves it for `UI_SECRET`, and a `{{resolve:ssm}}` for a missing parameter
  fails the whole stack update — that is exactly what stopped an earlier attempt at this
  feature from ever reaching AWS. Create it as a plain `String`: `{{resolve:ssm-secure}}`
  is only allowed on a short allowlist of resource properties and a Lambda environment
  variable is not one of them, which is why every secret this template reads is a plain
  String. **One parameter serves both environments** — note the name carries no
  `${TargetEnvr}`, unlike most of the others — because it is one person's password for one
  tool.
- **Each environment's api reports its own database, and only test may change it.** The
  binding guard is IAM: the prod role gets `rds:DescribeDBInstances` and nothing else, so
  the production instance cannot be stopped from here whatever the handler or the ui does.
  `isReadOnly()` in `logic/RdsService.ts` is the readable half — it answers the 403 and
  sets `readOnly` on the state so the ui can say *why* the buttons are dead, which
  `canStart`/`canStop` alone cannot distinguish from a transition. Its polarity is
  deliberate: anything that is not exactly `test` is read-only, so an unset or misspelled
  `TARGET_ENVR` fails safe.
- **403, not 404, for a forbidden mutation.** The route exists; saying so is what stops
  someone debugging a path that is not the problem. Authorisation is still checked first,
  so an unauthenticated caller learns nothing about the environment.
- **The route is `/api/db`, not `/api/test-db`.** It used to be the latter, when the api was
  test-only; now that prod serves its own instance the old name would lie.
- **Two `!If` shapes appear in this template and they are not interchangeable.** The api's
  start/stop IAM statement is a *list entry* that resolves to `AWS::NoValue` and is dropped,
  which works because the describe statement keeps the list non-empty. Where the whole list
  would otherwise become empty, `!If` has to go on the *property* instead — CloudFormation
  rejects an empty list.
- **The `/api/*` behavior must forward the `Authorization` header** or every request arrives
  without its bearer token and answers 401. Forwarding puts it in the cache key, which is
  harmless at TTL 0 and is what would stop one viewer's response reaching another if a TTL
  were ever added.
- The webapp is a static bundle and **holds no secret**: the viewer types the password once,
  it lives in that browser's `localStorage`, and it is sent as a bearer token.
  `src/lib/secret.ts` compares it in constant time. This is an interim scheme — `castor`
  uses Firebase Auth, which is where this should go before the api serves anything more
  sensitive than a db status.
- **`hono` and `hono-openapi` resolve under classic `node` moduleResolution** — which they
  have no business doing, since both ship only a `dist/`. `hono` carries a `typesVersions`
  map covering every subpath (`aws-lambda`, `factory`, `utils/*`), and both packages point
  `main` at a CommonJS build, so `require` and the node10 type lookup both land. This was
  the one risk that could have forced `moduleResolution` to change and chained into the
  whole tsconfig; it did not. Verify it again before adding any other `hono/*` subpath.
- **`zod` is 4.x here and 3.x in `castor`, deliberately.** It was going to match castor
  until the generator was actually run: on zod 3, `hono-openapi` converts schemas through
  `zod-openapi` v4 and fails without it, and making `.describe()` reach the document then
  needs `import 'zod-openapi/extend'` for its side effect — a subpath that this project's
  classic `node` moduleResolution cannot resolve, which would have meant a third tsconfig
  just for `tools/`. On zod 4, `hono-openapi` uses zod's own JSON Schema conversion:
  no `zod-openapi` dependency, no side-effect import, descriptions carried across for
  free. Nothing is shared between the repos, so the versions diverging costs nothing.
- **`.use('/api/db/*', bearerAuth)` also covers `/api/db` itself.** Hono's wildcard matches
  the empty remainder, which is what lets one line gate a whole group, and it matters for
  more than tidiness: it means a method-mismatched request (`POST /api/db`) is authorised
  *before* it falls through to the default 404, so a caller without the token cannot map
  which routes exist.
- **Hono matches the path exactly — `/api/db/` is a 404.** The hand-rolled router this
  replaced stripped a trailing slash. Nothing needed that: the webapp fetches these three
  paths verbatim, and `trailingSlash: true` in `next.config.ts` is about pages, not
  fetches. Buying the tolerance back costs either a redirect (`hono/trailing-slash`, which
  would change a POST's method) or a second route per path, and one url per resource is the
  better default. Pinned by a test so the answer is on record.
- **`noStore` sets `cache-control` before `next()`, not after.** After would miss every
  response `onError` builds — the error path being the one a cached response would be
  worst on. Hono applies a header set before the response exists to whatever is finally
  returned, which is what makes the ordering work.
- **The aws-lambda adapter answers in `multiValueHeaders`, not `headers`,** whenever the
  event carries a `multiValueHeaders` key — which API Gateway's REST payload 1.0 always
  does. Both shapes are valid and API Gateway accepts either, but a smoke test that builds
  its own event decides which branch it exercises.

### The OpenAPI document

- **`backend/openapi.json` is generated, committed, and checked.** `npm run openapi`
  (`tools/openapi.ts`) builds it from the route definitions; the webapp's types are
  generated from the committed file; and CI regenerates it and fails if the result
  differs. The check is what makes the document worth having — a committed document with
  nothing comparing it to the code rots into a confident lie. Never edit it by hand.
- **The generator imports the app, which is why it is safe.** `openAPIRouteHandler` walks
  the composed routes; nothing is invoked, no database is opened and no AWS api is called.
  So it needs no credentials and runs in CI on a bare checkout.
- **Only a route with a `describeRoute` appears in the document at all.** An undocumented
  route is absent, not listed without a schema — which is what would make it safe to
  adopt this one route group at a time, and also means the path count the generator prints
  is not a count of what the api serves.
- **Document every status a route can answer, including the ones a middleware produces.**
  `bearerAuth` is mounted on the whole group, so all three routes carry a 401. Leaving it
  out would describe an api that cannot refuse anyone.
- **The error body is a schema too** (`src/model/error/schema.ts`), so a 401 and a 403
  are typed in the webapp rather than being a status with an opaque body. That is the
  response the ui actually has to explain.
- **The webapp never hand-writes an api type.** `webapp/types/api.ts` holds one alias per
  endpoint into the generated `types/openapi.d.ts`, which is **not** committed —
  `postinstall`, `predev`, `prebuild` and `pretypecheck` all regenerate it, so a stale
  copy cannot survive anything you would run before noticing. The aliases exist because
  `operations['getApiDb']['responses'][200]['content']['application/json']` is unreadable
  in a type error, and because one alias per endpoint is the only place to change when an
  operationId does. This is the same arrangement as `castor`, whose migration to it found
  that most of the hand-written types it replaced were wrong.
- **The `Ok<K>` / `Err<K, S>` helpers resolve to `never` when the operation has no such
  response.** That fails at the alias, loudly, instead of quietly at the call site — so
  if an operationId or a status disappears from the document, `npm run typecheck` in
  `webapp/` is what tells you.
- **There are no `components.schemas` in this document.** zod 4's conversion inlines the
  response schema at each use, so `DbState` is three identical inline objects rather than
  a `$ref`. It makes the document repetitive and changes nothing about the generated
  types. Naming a component would mean a per-schema ref annotation; not worth it for one
  schema.

### The webapp

- **`next dev` has no api of its own**, so `next.config.ts` rewrites `/api/*` to
  `DEV_API_ORIGIN` (from `webapp/.env.local`, git-ignored; copy `.env.local.example`).
  That keeps the single-origin shape the deployed site has, so nothing in the code needs
  to know an api url and no CORS appears locally that production would not have. The
  rewrite is inside a `NODE_ENV !== 'production'` branch and cannot reach the export,
  which has nowhere to run one.
- **`trailingSlash: true` would 308 every api call to its trailing-slash form**, and hono
  matches paths exactly, so the proxied request would arrive as a 404 — `fetch` follows a
  308. Hence `skipTrailingSlashRedirect: true`, also dev-only. This was measured against a
  fake upstream, not reasoned about: without it the rewrite never fires at all. Which
  directories the export emits comes from `trailingSlash` itself and is unaffected —
  verified by building a second route and finding `out/<route>/index.html`.
- **The page may not read `localStorage` on its first render.** The export prerenders
  `app/page.tsx` at build time, so the stored password is read in a `useEffect` and a
  `ready` flag distinguishes "not looked yet" from "no password" — both of which are
  `secret === null`. Skipping that is a hydration mismatch. The prerendered html is
  therefore the heading and nothing else, which is correct, not a broken build.
- **A 401 anywhere clears the stored password** and drops back to the password screen: it
  is the only signal the browser gets that the secret was changed on the server. The
  password screen checks a new password against the api *before* storing it, so a wrong
  one is never written to the browser at all.
- **The page polls while RDS is between states** — every 30s, and only while the tab is
  visible, until the status is `available` or `stopped`. Those two are the only statuses
  RDS will not leave on its own; `starting`, `stopping`, `backing-up` and `modifying` all
  resolve without anyone doing anything.
- **The notes under the card are in Chinese, and that changes how they are written.**
  **JSX joins the lines of a text node with a single space** — invisible in English,
  but Chinese does not space its words, so every line prettier wrapped would put a gap
  mid-sentence. Each note is therefore a string constant rendered as `{NOTE}`, never bare
  JSX text, and the block carries `lang="zh-Hant"` because the document is `lang="en"`.
  Labels, buttons and error messages are still English.
- **The card states the stop-db schedule, and those times are duplicated.** `DbCard`
  tells the viewer the instance is stopped at 05:00 and 19:00 Taipei time, because "why
  did my database turn itself off" is the first thing the page should answer. The api does
  not report the schedule, so the times are written into the component and have to be
  changed in **both** places if
  [the template](backend/aws/cloudformation/template.yaml)'s `ScheduleStopDb` changes.
  The note is shown when `readOnly` is false, i.e. in test -- the only environment the
  `stop-db` lambda exists in at all. Those are two separate mechanisms that agree only
  because both read `TARGET_ENVR`; making prod writable would have to stop this note
  coming with it.
- **The webapp has no test runner.** `npm run typecheck` and `npm run lint` are the whole
  of what guards it, in CI too. Worth adding when there is a second page;
  `castor/webapp` is the reference.

### The local databases

- **`COCKROACH_DB_CLUSTER` being set or not is what selects Cloud vs local** in
  `src/db/cockroach.ts` — set means the cluster-prefixed database name, the `--cluster`
  startup option and TLS; unset means a plain database name and no TLS. Production always
  resolves it from SSM, a single node has no such thing, so there is no separate flag.
- **`MYSQL_DB_PORT` / `COCKROACH_DB_PORT` default to 3306 / 26257**, which is what
  production uses, and the compose file publishes 3307 / 26258 instead. `castor`'s compose
  file binds 3306, and only one process can have it.
- **CockroachDB refuses `--insecure` with a hostname in `--listen-addr`** —
  `hostname of listen_addr must be "127.0.0.1" or "localhost"`. The compose file passes no
  `--listen-addr` at all, whose default `:26257` already means every interface. Do not
  "fix" it to `0.0.0.0:26257`; the node will not start.
- **CockroachDB has no `/docker-entrypoint-initdb.d`**, so a one-shot `cockroach-init`
  service applies the schema once the node is healthy. It drops and recreates the database
  rather than needing `CREATE TABLE IF NOT EXISTS`, which keeps `db/*.sql` exactly as they
  are applied to the real cluster and makes `db:up` repeatable.
- **`docker compose up --wait` fails on a service that exited**, even with status 0, so
  `db:up` waits on the two long-running services and then runs the init container with
  `compose run`, whose exit code it can trust.

### Application behaviour

- `MonitorService` appends `limit/offset` to operator-authored SQL from the `monitor` table
  and paginates until an empty page; `SQL_LIMIT` must be set and numeric or it throws. That
  statement is run through `sql.raw` because the operator writes it — it cannot be
  parameterised, and a monitor whose SQL carries its own `limit` or a trailing semicolon
  breaks when the suffix is appended.
- **The rows a monitor sends to Google Sheets have string integers.** `sql.raw` means
  there is no drizzle column type to convert anything, and the pg driver's default parser
  for `INT8` — which is every integer in CockroachDB — returns a string, to avoid losing
  precision past 2^53. So `select 1 as n` reaches the Sheet as `{ n: '1' }`. This is not
  new: TypeORM's `manager.query()` went through the same parsers. It matters only if the
  Sheet is expected to treat the column as a number. Reads that go *through the schema*,
  such as `monitor_his.rowCount`, do come back as numbers — `bigint({ mode: 'number' })`
  is what does that. Both halves are pinned in `regression/monitor.test.ts`.
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
- **`insertIps` is an insert-if-absent** (`ON DUPLICATE KEY UPDATE ip = ip`), and has to
  be. `LoggerService` calls `findIp` first, but the event source mapping allows two
  concurrent batches, so both can see the same unknown ip and both insert — and the loser
  used to get `ER_DUP_ENTRY`, failing the transaction and rolling its whole batch back.
  The race is not new; TypeORM's `manager.save()` hid it by issuing an UPDATE when the
  primary key existed, and the drizzle rewrite exposed it in production. Not
  `INSERT IGNORE`: that downgrades every error to a warning, including a value too long
  for its column. Pinned by three cases in `regression/logger.test.ts` that fail with the
  real `ER_DUP_ENTRY` if the clause is removed.
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
