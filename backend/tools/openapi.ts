import { writeFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { app } from 'src/app';

/**
 * Writes the OpenAPI document for this api to openapi.json.
 *
 * Generated from the route definitions rather than hand-written, and written
 * to a file rather than served: nothing needs it at runtime, and a document of
 * every endpoint is a map of the attack surface. The webapp's types are
 * generated from the committed file.
 *
 * Only routes carrying a `describeRoute` appear at all -- an undocumented
 * route is absent from the document, not listed without a schema.
 *
 * Run with `npm run openapi`. It touches no database and no AWS api: importing
 * the app composes the routes, it does not invoke them.
 *
 * Unlike `castor`'s generator this does not import `zod-openapi/extend`.
 * hono-openapi 1.x reads schemas through standard-schema and carries
 * `.describe()` across on its own; the import would also not resolve under
 * this project's classic `node` moduleResolution.
 */
const OUT = 'openapi.json';

const spec = new Hono().get(
  '/openapi.json',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'polaris API',
        version: '1.0.0',
        description:
          'The api behind the polaris back-office webapp. Generated from the backend route definitions by tools/openapi.ts -- do not edit by hand.\n\nEvery request needs `Authorization: Bearer <UI_SECRET>`, one password shared by both environments. Served from the same hostname as the webapp, as a second origin on one CloudFront distribution, so there is no cross-origin request to configure.',
      },
      servers: [
        {
          url: 'https://polaris.celestialstudio.net',
          description: 'production',
        },
        {
          url: 'https://polaris-test.celestialstudio.net',
          description: 'test',
        },
      ],
    },
  })
);

const main = async (): Promise<void> => {
  const res = await spec.request('/openapi.json');
  if (!res.ok)
    throw new Error(`generation failed: ${res.status} ${await res.text()}`);

  const document: unknown = await res.json();
  // Pretty-printed with a trailing newline so the committed file diffs line by
  // line and the CI check can compare it byte for byte.
  await writeFile(OUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const paths = Object.keys(
    (document as { paths?: Record<string, unknown> }).paths ?? {}
  );
  console.log(`wrote ${OUT}: ${paths.length} paths`);
};

void main();
