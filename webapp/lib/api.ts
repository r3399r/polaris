/**
 * The only module that calls the api.
 *
 * Paths are relative on purpose. The api is a second origin on the same
 * CloudFront distribution as this bundle, on an `/api/*` behavior, so the
 * browser only ever talks to one hostname: there is no api url to configure,
 * nothing to put in an environment variable, and no CORS anywhere. `next dev`
 * has no backend of its own, so next.config.ts proxies the same paths there.
 *
 * Every shape comes from `types/api.ts`, which is generated from the server's
 * own schemas. Nothing here is hand-written.
 */
import type { ApiError, DbState } from '@/types/api';

export const UNAUTHORIZED = 401;

/**
 * A response the api refused. `extends Error` because the status has to
 * survive a throw, and `instanceof` is the only way to tell it from a network
 * failure at the catch site.
 */
export class ApiFailure extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
  }
}

/**
 * The api answers errors with a documented body whose `message` is written to
 * be shown to a viewer. CloudFront and API Gateway can both answer before the
 * app does, though, and neither sends one -- hence the fallback.
 */
const readMessage = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (body.message) return body.message;
  } catch {
    // not json, or not that json
  }

  return `${res.status} ${res.statusText}`.trim();
};

const request = async (
  path: string,
  method: 'GET' | 'POST',
  secret: string
): Promise<DbState> => {
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${secret}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new ApiFailure(res.status, await readMessage(res));

  return (await res.json()) as DbState;
};

export const getDbState = (secret: string): Promise<DbState> =>
  request('/api/db', 'GET', secret);

export const startDb = (secret: string): Promise<DbState> =>
  request('/api/db/start', 'POST', secret);

export const stopDb = (secret: string): Promise<DbState> =>
  request('/api/db/stop', 'POST', secret);

/**
 * The two statuses RDS will not leave on its own. Everything else --
 * `starting`, `stopping`, `backing-up`, `modifying` -- resolves without
 * anyone doing anything, which is what the page polls through.
 */
const SETTLED = ['available', 'stopped'];

export const isSettled = (status: string): boolean => SETTLED.includes(status);

/**
 * What to show a viewer. An `ApiFailure` carries a message the server wrote
 * for exactly this; anything else is a network failure whose own message
 * ("Failed to fetch") explains nothing.
 */
export const describeFailure = (err: unknown): string =>
  err instanceof ApiFailure ? err.message : 'Could not reach the api.';
