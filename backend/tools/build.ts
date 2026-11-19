import { stat } from 'node:fs/promises';
import { build } from 'esbuild';

/**
 * Bundles each entry in `src/lambda/` into its own `dist/<name>/index.js`.
 *
 * One bundle per lambda rather than one shared package, which is the whole
 * point: a shared entry makes every function carry the union of what all five
 * import, and the smallest of these then weighs the same as the largest. Each
 * file in `src/lambda/` imports only what that handler needs, so stop-db does
 * not ship drizzle, hono or the Google client.
 *
 * This replaced a Lambda layer that was nothing but `backend/node_modules`
 * copied wholesale -- 37MB and 90 packages on every function, @types included.
 *
 * Run by `npm run build`, and by `npm run pre:deploy`, which cleans and
 * typechecks first.
 */

/**
 * Optional schema adapters that `hono-openapi` reaches for through
 * `@standard-community/standard-json`:
 *
 *     importIfInstalled(() => import('zod-to-json-schema'))
 *
 * The guard is a runtime one, but esbuild resolves a dynamic import at build
 * time and fails on a package that is not installed -- so without these the
 * build does not merely warn, it stops. None of them is installed and none is
 * wanted: zod 4 converts its own schemas, which is why `zod-openapi` is not a
 * dependency either. Marking them external leaves the unresolved specifier in
 * the bundle, where the `importIfInstalled` guard is what catches it.
 */
const EXTERNAL = [
  'zod-to-json-schema',
  '@valibot/to-json-schema',
  '@gcornut/valibot-json-schema',
  'effect',
  '@effect/schema',
  'arktype',
];

/** Output directory name -> entry. The name is what `CodeUri` points at. */
const ENTRIES: Record<string, string> = {
  api: 'src/lambda/api.ts',
  monitor: 'src/lambda/monitor.ts',
  houseKeeping: 'src/lambda/houseKeeping.ts',
  logger: 'src/lambda/logger.ts',
  stopDb: 'src/lambda/stopDb.ts',
};

const bundle = async (name: string, entry: string): Promise<string> => {
  const outfile = `dist/${name}/index.js`;

  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    // Matches the Runtime in aws/cloudformation/template.yaml.
    target: 'node24',
    // The package is CommonJS and the handlers are `require`d by the runtime.
    format: 'cjs',
    // Deliberately NOT minified, which is where this differs from `castor`.
    // Minifying saves about 1.3MB a function and costs every stack trace in
    // CloudWatch its line numbers; buying those back with a sourcemap costs
    // more than not minifying did (a 4MB map against a 1.3MB saving), plus
    // NODE_OPTIONS=--enable-source-maps on every function. polaris is the
    // service you read logs *in*.
    minify: false,
    // esbuild reads `paths` from here, which is what resolves `src/*` -- the
    // job ts-patch and typescript-transform-paths used to do for the emitted
    // output.
    tsconfig: 'tsconfig.json',
    external: EXTERNAL,
    logLevel: 'silent',
  });

  for (const warning of result.warnings)
    console.warn(`${name}: ${warning.text}`);

  const { size } = await stat(outfile);

  return `${name.padEnd(13)} ${String(Math.round(size / 1024)).padStart(5)} KB`;
};

const main = async (): Promise<void> => {
  const lines = await Promise.all(
    Object.entries(ENTRIES).map(([name, entry]) => bundle(name, entry))
  );

  console.log(lines.join('\n'));
};

void main();
