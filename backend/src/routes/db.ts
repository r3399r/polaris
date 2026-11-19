import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { getState, isReadOnly, startDb, stopDb } from 'src/logic/RdsService';
import { dbStateSchema } from 'src/model/Db';
import { errorResponseSchema, ForbiddenError } from 'src/model/error';

const state = {
  description: 'The state of the instance after the call',
  content: { 'application/json': { schema: resolver(dbStateSchema) } },
};

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: resolver(errorResponseSchema) } },
});

/**
 * Every route can answer this one -- `bearerAuth` is mounted on the whole
 * group in app.ts -- so every route documents it. Leaving it out would make
 * the document describe an api that cannot refuse anyone.
 */
const unauthorized = error('Missing or wrong bearer token');

const getDoc = describeRoute({
  summary: "This environment's MySQL instance",
  description:
    'Each environment reports its own instance. Available in production too, where it is read-only.',
  tags: ['db'],
  responses: { 200: state, 401: unauthorized },
});

const startDoc = describeRoute({
  summary: 'Start the instance',
  description:
    'Test environment only; 403 elsewhere. A no-op unless the status is exactly `stopped` -- RDS rejects a start during any transition.',
  tags: ['db'],
  responses: {
    200: state,
    401: unauthorized,
    403: error('Read-only environment: this is not the test environment'),
  },
});

const stopDoc = describeRoute({
  summary: 'Stop the instance',
  description:
    'Test environment only; 403 elsewhere. A no-op unless the status is exactly `available`.',
  tags: ['db'],
  responses: {
    200: state,
    401: unauthorized,
    403: error('Read-only environment: this is not the test environment'),
  },
});

/**
 * Mounted at `/api/db` -- not `/api/test-db`, which it was called while the
 * api was test-only and which would now lie.
 *
 * Only the test environment may act on the instance. The guard that actually
 * holds is IAM: the prod api's role has `rds:DescribeDBInstances` and nothing
 * else, so production cannot be stopped from here whatever this file says.
 * The 403 below is the readable half.
 *
 * 403 and not 404 deliberately: the route exists, it is forbidden here, and
 * saying so is what stops someone debugging a path that is not the problem.
 * Authorisation is checked before this, in app.ts, so an unauthenticated
 * caller still learns nothing about the environment.
 *
 * Each mutation answers with a freshly read state rather than the one it had
 * before, so the ui gets `starting` / `stopping` without a second request.
 */
const requireWritable = () => {
  if (isReadOnly()) throw new ForbiddenError('read only in this environment');
};

export const db = new Hono()
  .get('/', getDoc, async (c) => c.json(await getState()))
  .post('/start', startDoc, async (c) => {
    requireWritable();
    await startDb();

    return c.json(await getState());
  })
  .post('/stop', stopDoc, async (c) => {
    requireWritable();
    await stopDb();

    return c.json(await getState());
  });
