/**
 * The base of every error this api answers with deliberately.
 *
 * A class, unlike everything else in this codebase -- `extends Error` is the
 * only way to get an `instanceof` check, and `instanceof` is what
 * `lib/errorResponse.ts` uses to tell an intended status from a bug. The
 * "no classes" rule in AGENTS.md is about services and wiring, not this.
 */
export class HttpError extends Error {
  public status: number;
  public code: string;

  constructor(status?: number, message?: string) {
    super(message ?? 'Unknown Error');
    this.status = status ?? 500;
    this.name = 'UnknownError';
    this.code = 'UNKNOWN_ERROR';
  }
}
