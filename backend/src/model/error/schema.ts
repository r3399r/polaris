import { z } from 'zod';

/**
 * The body of every error this api answers with, success aside.
 *
 * Built by `lib/errorResponse.ts` from whatever was thrown. It is a schema
 * rather than a type so the routes can name it in `describeRoute` and the
 * webapp gets it generated -- a 401 or a 403 that the ui has to explain is
 * exactly the response worth having typed.
 */
export const errorResponseSchema = z.object({
  status: z.number().describe('Repeats the http status, for logging'),
  name: z
    .string()
    .describe('The error class, e.g. ForbiddenError or InternalServerError'),
  message: z
    .string()
    .describe(
      "Safe to show a viewer. Always `Internal Server Error` on a 500 -- an unexpected error's own message is logged and dropped"
    ),
  code: z
    .string()
    .optional()
    .describe('A stable identifier to branch on, e.g. FORBIDDEN'),
});

export type ErrorResponseBody = z.infer<typeof errorResponseSchema>;
