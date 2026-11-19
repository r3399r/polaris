import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Vite's root, with the Windows drive letter forced to upper case.
 *
 * Copied from castor, where this was diagnosed. Vite takes its root from
 * `process.cwd()`, which keeps whatever case the shell handed it -- `c:/...`
 * from a POSIX shell, `C:/...` from PowerShell. Windows' own path APIs always
 * answer `C:/...`, so that is the case every module resolved through
 * node_modules arrives with.
 *
 * Mixing the two fails nothing: both spellings open the same file and every
 * test passes either way. What breaks silently is coverage -- the v8 provider
 * keeps only results whose URL sits under the root, so a lower-case root throws
 * away every `src/**` module and the report reads 0%. It looks like "nothing is
 * tested" when the truth is "nothing was measured".
 *
 * It also keeps the mock registry to one spelling: `vi.mock('src/db/queries/...')`
 * is keyed by resolved id, and a module reached under two spellings registers
 * its mock under one and looks it up under the other.
 *
 * This is the same class of problem as `next build` failing from a lower-case
 * drive letter -- see the gotcha in AGENTS.md.
 */
// Done by hand rather than with vite's own normalizePath, so this file needs no
// import from 'vite': vite's types are only reachable under moduleResolution
// node16/nodenext/bundler, and tsconfig.json is on classic 'node' for the
// CommonJS Lambda build.
const root = process
  .cwd()
  .replace(/\\/g, '/')
  .replace(/^[a-z]:/, (drive: string) => drive.toUpperCase());

export default defineConfig({
  root,
  // tsconfig.json's `exclude` drops src/**/*.test.ts. It no longer has to --
  // nothing is emitted from that project since esbuild took the build over,
  // and a bundle only pulls in what its entry reaches -- but it is also what
  // leaves the tests without a project of their own, so tsconfig.tools.json
  // covers them (and regression/) and is where the `src/*` alias resolves for
  // them. Collapsing the two is a separate change.
  plugins: [tsconfigPaths({ projects: ['./tsconfig.tools.json'] })],
  test: {
    environment: 'node',
    // Applied to every run, not just the regression one. Harmless for the unit
    // tests: it only fills in local defaults with `??=`.
    setupFiles: ['./regression/setup.ts'],
    // The regression files share one connection pool per database and clear
    // tables between cases, so running them in parallel would race on that.
    // The unit tests do not care, and at this size neither does the clock.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // Wiring only: these construct connection pools and sdk clients, which
      // every test mocks, so coverage on them would measure "was this file
      // loaded", not "was this behaviour tested". Excluded for signal.
      //
      // src/index.ts is NOT excluded: the api handler's routing and bearer-token
      // check are real logic and src/app.test.ts covers them.
      exclude: [
        'src/db/mysql.ts',
        'src/db/cockroach.ts',
        'src/lib/rds.ts',
        'src/lib/googleSheets.ts',
        'src/lib/ipApi.ts',
      ],
    },
  },
});
