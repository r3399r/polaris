import { handle } from 'hono/aws-lambda';
import { app } from 'src/app';

/**
 * The http api. Everything it does is in src/app.ts; this is the adapter that
 * turns API Gateway's event into a Request and the Response back into a
 * result, so the app itself is testable without an event shape at all.
 *
 * The CloudFormation handler stays `index.api`. Each lambda is bundled into
 * its own `dist/<name>/index.js`, so the export name is unchanged and only
 * `CodeUri` moved.
 */
export const api = handle(app);
