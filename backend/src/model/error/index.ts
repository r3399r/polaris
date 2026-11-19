/**
 * Only the three this api actually throws. castor carries seven; copying the
 * other four over would be dead code, and Hono answers an unmatched route
 * with its own 404 so there is no NotFoundError to raise.
 */
export { ForbiddenError } from './ForbiddenError';
export { HttpError } from './HttpError';
export { UnauthorizedError } from './UnauthorizedError';
