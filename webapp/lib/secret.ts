/**
 * Where the viewer's password lives.
 *
 * The webapp is a static bundle and holds no secret of its own: the viewer
 * types the one password the api has, it is kept in this browser, and it is
 * sent as a bearer token on every request. This is an interim scheme --
 * `castor` uses Firebase Auth, which is where this should go before the api
 * serves anything more sensitive than a db status.
 *
 * Every access is wrapped, because localStorage *throws* rather than
 * answering null when a browser refuses site data -- Safari's private mode, a
 * locked-down profile. Forgetting the password between visits is a worse
 * experience; an exception on load is a blank page.
 */
const KEY = 'polaris.secret';

export const readSecret = (): string | null => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const writeSecret = (secret: string): void => {
  try {
    window.localStorage.setItem(KEY, secret);
  } catch {
    // Not fatal: this session still works, the next one asks again.
  }
};

export const clearSecret = (): void => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // If it could not be written it cannot have been stored.
  }
};
