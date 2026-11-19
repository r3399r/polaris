import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { bearerAuth } from 'src/middleware/bearerAuth';
import { noStore } from 'src/middleware/noStore';
import { db } from 'src/routes/db';

/**
 * The webapp's backend. Routed here rather than in API Gateway -- one proxy
 * route, one lambda, same shape as castor.
 *
 * `/api/db/*` also matches `/api/db` itself in Hono, so the one line covers
 * the whole group, including the method-mismatched requests that fall through
 * to the default 404: authorisation is checked before a caller is told
 * whether a route exists.
 *
 * Note the paths are absolute, with the `/api` prefix. CloudFront forwards
 * `/api/*` to API Gateway unchanged and the stage has a single `/{proxy+}`
 * route, so what arrives here is the browser's path verbatim. There is no
 * CORS middleware because there is no cross-origin request to allow: the
 * webapp and this api are two origins on one distribution.
 */
export const app = new Hono()
  .use('*', noStore)
  .use('/api/db/*', bearerAuth)
  .route('/api/db', db)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
