import { z } from 'zod';

/**
 * What `GET /api/db` reports, and the one description of it.
 *
 * A schema rather than a hand-written type: the service returns it, the route
 * answers with it, and the OpenAPI document is generated from it, so there is
 * nothing for a separately written type to drift away from.
 *
 * It lives here rather than in `routes/db.ts`, which is where castor keeps
 * its response schemas -- castor has no service layer, its queries sit in the
 * route. polaris has `logic/RdsService`, and a service that had to import a
 * route to name its own return type would have the layering backwards.
 *
 * `.describe()` is not a comment: it reaches the generated document, and so
 * reaches whoever writes a client against it.
 */
export const dbStateSchema = z.object({
  identifier: z
    .string()
    .describe('RDS instance identifier, e.g. celestial-studio-mysql-test'),
  status: z
    .string()
    .describe(
      "The instance's RDS status verbatim: available, stopped, starting, stopping, backing-up, modifying, ... or `unknown` if RDS reported none"
    ),
  canStart: z
    .boolean()
    .describe('Whether POST /api/db/start would be accepted right now'),
  canStop: z
    .boolean()
    .describe('Whether POST /api/db/stop would be accepted right now'),
  readOnly: z
    .boolean()
    .describe(
      'True outside the test environment, where the instance can only be reported. Lets the ui say why the buttons are dead instead of leaving it indistinguishable from a transition'
    ),
});

export type DbState = z.infer<typeof dbStateSchema>;
