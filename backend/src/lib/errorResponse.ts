import { ContentfulStatusCode } from 'hono/utils/http-status';
import { HttpError } from 'src/model/error';

export type ErrorResponseBody = {
  status: number;
  name: string;
  message: string;
  code?: string;
};

/**
 * Turns anything thrown inside a route into the response for it.
 *
 * An `HttpError` is an answer the api meant to give, so its message is
 * passed through. Anything else is a bug, and becomes a bare 500 with no
 * detail -- the stack is already in CloudWatch, and the browser is the one
 * place it must not appear.
 */
export const toErrorResponse = (
  err: unknown
): { status: ContentfulStatusCode; body: ErrorResponseBody } => {
  if (err instanceof HttpError)
    return {
      status: err.status as ContentfulStatusCode,
      body: {
        status: err.status,
        name: err.name,
        message: err.message,
        code: err.code,
      },
    };

  return {
    status: 500,
    body: {
      status: 500,
      name: 'InternalServerError',
      message: 'Internal Server Error',
    },
  };
};
