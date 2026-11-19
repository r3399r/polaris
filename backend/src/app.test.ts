import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import * as rdsService from 'src/logic/RdsService';

// routes/db.ts imports this as 'src/logic/RdsService'; vite's mock registry is
// keyed by resolved id, so the mock applies however the route spells it.
vi.mock('src/logic/RdsService');
const service = vi.mocked(rdsService);

const SECRET = 'correct-horse-battery-staple';

const state = {
  identifier: 'celestial-studio-mysql-test',
  status: 'stopped',
  canStart: true,
  canStop: false,
  readOnly: false,
};

/**
 * The app is exercised through `app.request()` rather than through the lambda
 * handler: `handle()` is hono's adapter and is hono's tested code, so going
 * through it would only add an event shape to maintain.
 */
const req = (
  method: string,
  path: string,
  headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }
) => app.request(path, { method, headers });

describe('app', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.UI_SECRET = SECRET;
    service.getState.mockReset().mockResolvedValue(state);
    service.startDb.mockReset().mockResolvedValue(undefined);
    service.stopDb.mockReset().mockResolvedValue(undefined);
    service.isReadOnly.mockReset().mockReturnValue(false);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('authorisation', () => {
    it('serves a request with the right bearer token', async () => {
      const res = await req('GET', '/api/db');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(state);
    });

    it('accepts the token without the Bearer prefix', async () => {
      const res = await req('GET', '/api/db', { authorization: SECRET });

      expect(res.status).toBe(200);
    });

    // API Gateway preserves the client's header casing, so the lookup has to
    // be case-insensitive or a browser's lowercase header never matches. hono
    // reads headers off a Request, which is case-insensitive by spec -- this
    // pins that, rather than a hand-rolled lookup.
    it('finds the header whatever its case', async () => {
      const res = await req('GET', '/api/db', {
        AUTHORIZATION: `Bearer ${SECRET}`,
      });

      expect(res.status).toBe(200);
    });

    it.each([
      ['a wrong token', { authorization: 'Bearer nope' }],
      ['no header at all', {}],
      ['an empty token', { authorization: 'Bearer ' }],
    ])('answers 401 for %s', async (_label, headers) => {
      const res = await req('GET', '/api/db', headers);

      expect(res.status).toBe(401);
      expect(service.getState).not.toHaveBeenCalled();
    });

    it('answers 500 rather than 401 when UI_SECRET is missing', async () => {
      delete process.env.UI_SECRET;

      const res = await req('GET', '/api/db');

      // a misconfigured stack is not an authentication failure, and saying 401
      // would send someone hunting for the wrong problem
      expect(res.status).toBe(500);
    });
  });

  describe('routing', () => {
    it('starts the instance and answers with the new state', async () => {
      const res = await req('POST', '/api/db/start');

      expect(service.startDb).toHaveBeenCalled();
      expect(res.status).toBe(200);
      // the state is re-read after the call, so the ui gets `starting`
      expect(service.getState).toHaveBeenCalled();
    });

    it('stops the instance and answers with the new state', async () => {
      const res = await req('POST', '/api/db/stop');

      expect(service.stopDb).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    // hono matches the path exactly. The hand-rolled router this replaced
    // stripped a trailing slash; nothing needed that -- the webapp fetches
    // these three paths verbatim, and `trailingSlash` in next.config.ts is
    // about pages, not fetches -- and one url per resource is the better
    // default. Pinned so that the day something does send one, this is the
    // answer to look at.
    it.each([
      ['GET', '/api/db/'],
      ['POST', '/api/db/start/'],
    ])(
      'does not match %s %s, with its trailing slash',
      async (method, path) => {
        const res = await req(method, path);

        expect(res.status).toBe(404);
      }
    );

    it.each([
      ['POST', '/api/db'],
      ['GET', '/api/db/start'],
      ['DELETE', '/api/db'],
      ['GET', '/api/something-else'],
      ['GET', '/'],
    ])('answers 404 for %s %s', async (method, path) => {
      const res = await req(method, path);

      expect(res.status).toBe(404);
      expect(service.startDb).not.toHaveBeenCalled();
      expect(service.stopDb).not.toHaveBeenCalled();
    });
  });

  // The prod site shows its own database's status and must not be able to
  // touch it. IAM is what guarantees that -- the prod role has no
  // Start/StopDBInstance at all -- but the api should answer cleanly rather
  // than let the sdk raise AccessDenied.
  describe('a read-only environment', () => {
    beforeEach(() => service.isReadOnly.mockReturnValue(true));

    it('still reports the state', async () => {
      const res = await req('GET', '/api/db');

      expect(res.status).toBe(200);
    });

    it.each([['/api/db/start'], ['/api/db/stop']])(
      'answers 403 for POST %s',
      async (path) => {
        const res = await req('POST', path);

        // 403, not 404: the route exists and is forbidden here
        expect(res.status).toBe(403);
        expect(service.startDb).not.toHaveBeenCalled();
        expect(service.stopDb).not.toHaveBeenCalled();
      }
    );

    // The body the webapp reads to explain itself, not just the status.
    it('says which error it is', async () => {
      const res = await req('POST', '/api/db/start');

      expect(await res.json()).toEqual({
        status: 403,
        name: 'ForbiddenError',
        message: 'read only in this environment',
        code: 'FORBIDDEN',
      });
    });

    it('checks authorisation before the environment', async () => {
      const res = await req('POST', '/api/db/start', {
        authorization: 'Bearer nope',
      });

      // an unauthenticated caller learns nothing about the environment
      expect(res.status).toBe(401);
    });
  });

  describe('failures', () => {
    it('answers 500 when the service throws', async () => {
      service.getState.mockRejectedValue(new Error('rds is unhappy'));

      const res = await req('GET', '/api/db');

      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain('rds is unhappy');
    });

    it('never caches a response', async () => {
      const res = await req('GET', '/api/db');

      expect(res.headers.get('cache-control')).toBe('no-store');
    });

    // noStore sets the header before next(), so it survives the error path --
    // which is the one a stale response would be worst on.
    it('never caches an error either', async () => {
      service.getState.mockRejectedValue(new Error('rds is unhappy'));

      const res = await req('GET', '/api/db');

      expect(res.headers.get('cache-control')).toBe('no-store');
    });
  });
});
