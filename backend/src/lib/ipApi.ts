import axios from 'axios';
import { Ip } from 'src/model/Ip';

/**
 * ip-api.com geo lookup. Free and unauthenticated, so it is rate limited and
 * answers 200 with `status: 'fail'` rather than an http error.
 *
 * This lives here, rather than inline in LoggerService, so the service can be
 * tested by mocking this module. Mocking `axios` directly is not reliable under
 * vitest: vite pre-bundles node_modules dependencies, and the mock registry is
 * keyed by resolved id, so `vi.mock('axios')` silently fails to apply once the
 * dependency cache is cold -- it passes when the file runs alone and fails in
 * the suite. A module under `src/` has no such problem.
 */
export const getIpInfo = async (ip: string) => {
  const result = await axios.get<Ip>(
    `http://ip-api.com/json/${ip}?fields=1171481`
  );
  if (result.data.status === 'fail') throw new Error('ip-api failed');

  return result.data;
};
