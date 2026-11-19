import { createMiddleware } from 'hono/factory';
import { secretMatches } from 'src/lib/secret';
import { UnauthorizedError } from 'src/model/error';

/**
 * The webapp is a static bundle and cannot hold a secret, so the viewer types
 * the password once, the browser keeps it, and sends it as a bearer token on
 * every request. Compared in constant time; see lib/secret.ts.
 *
 * A missing UI_SECRET throws a plain Error rather than rejecting the caller:
 * a misconfigured stack is not an authentication failure, and answering 401
 * would send someone hunting for the wrong problem.
 *
 * This is an interim scheme -- castor uses Firebase Auth, which is where this
 * should go before the api serves anything more sensitive than a db status.
 */
export const bearerAuth = createMiddleware(async (c, next) => {
  const secret = process.env.UI_SECRET;
  if (!secret) throw new Error('UI_SECRET is not set');

  const given = (c.req.header('Authorization') ?? '').replace(
    /^Bearer\s+/i,
    ''
  );
  if (!secretMatches(given, secret)) throw new UnauthorizedError();

  await next();
});
