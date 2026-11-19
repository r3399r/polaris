import { createMiddleware } from 'hono/factory';

/**
 * Marks every api response uncacheable.
 *
 * The CloudFront behavior in front of this api is pinned at TTL 0 and the
 * `Authorization` header is in its cache key, so nothing should be stored
 * there anyway -- this is the half that does not depend on getting the
 * distribution right, and it also covers the browser's own cache.
 *
 * Set before `next()`, not after, so it reaches the error responses that
 * `onError` builds as well as the ones the routes return.
 */
export const noStore = createMiddleware(async (c, next) => {
  c.header('cache-control', 'no-store');
  await next();
});
