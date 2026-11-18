import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mysql from 'src/db/queries/mysql';
import { MysqlDb } from 'src/db/queries/mysql';
import * as ipApi from 'src/lib/ipApi';
import { saveApiLog } from 'src/logic/LoggerService';
import { QueueEvent } from 'src/model/Aws';
import { LoggerInput } from 'src/model/Logger';

// Both mock targets are modules under src/. Mocking `axios` directly instead
// does not work reliably: vite pre-bundles node_modules dependencies and the
// mock registry is keyed by resolved id, so the mock silently fails to apply
// with a cold dependency cache -- it passes when this file runs alone and fails
// in the suite. That is why src/lib/ipApi.ts exists.
vi.mock('src/db/queries/mysql');
vi.mock('src/lib/ipApi');
const m = vi.mocked(mysql);
const ip = vi.mocked(ipApi);

// The queries are mocked, so the handle is never dereferenced.
const db = {} as MysqlDb;

const baseInput: LoggerInput = {
  project: 'altarf',
  resource: 'user',
  path: '/user/1',
  httpMethod: 'GET',
  queryStringParameters: null,
  body: null,
  elapsedTime: 12,
  statusCode: 200,
  version: '1.0.0',
  ip: '1.1.1.1',
  dateRequested: '2026-11-18T00:00:00.000Z',
};

const ipInfo = {
  status: 'success',
  continent: 'Asia',
  country: 'Taiwan',
  regionName: 'Taipei',
  city: 'Taipei',
  mobile: false,
  query: '1.1.1.1',
};

const knownIpRow = {
  ip: '1.1.1.1',
  continent: 'Asia',
  country: 'Taiwan',
  region: 'Taipei',
  city: 'Taipei',
  mobile: false,
  dateCreated: new Date(),
};

const event = (overrides: Partial<LoggerInput>[]): QueueEvent =>
  ({
    Records: overrides.map((o, i) => ({
      messageId: String(i),
      body: JSON.stringify({ ...baseInput, ...o }),
    })),
  }) as unknown as QueueEvent;

describe('LoggerService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ip.getIpInfo.mockReset().mockResolvedValue(ipInfo);

    m.findIp.mockReset().mockResolvedValue(undefined);
    m.insertIps.mockReset().mockResolvedValue(undefined);
    m.insertLogApi.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('log rows', () => {
    it('writes one row per record, always', async () => {
      await saveApiLog(db, event([{}, {}, {}]));

      expect(m.insertLogApi).toHaveBeenCalledTimes(1);
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(3);
    });

    it('passes the numeric columns through as numbers', async () => {
      await saveApiLog(db, event([{ statusCode: 404, elapsedTime: 1234 }]));

      const row = m.insertLogApi.mock.calls[0][1][0];
      expect(row.statusCode).toBe(404);
      expect(row.elapsedTime).toBe(1234);
    });

    it('carries the rest of the payload through unchanged', async () => {
      await saveApiLog(
        db,
        event([{ project: 'castor', path: '/q/7', body: '{"a":1}' }])
      );

      const row = m.insertLogApi.mock.calls[0][1][0];
      expect(row.project).toBe('castor');
      expect(row.path).toBe('/q/7');
      expect(row.body).toBe('{"a":1}');
      expect(row.dateRequested).toEqual(new Date(baseInput.dateRequested));
    });

    // Current behaviour: an empty batch still reaches the query layer.
    it('calls the insert even with no records', async () => {
      await saveApiLog(db, event([]));
      expect(m.insertLogApi).toHaveBeenCalledWith(db, []);
    });
  });

  describe('ip enrichment', () => {
    it('looks up and stores an unseen ip', async () => {
      await saveApiLog(db, event([{ ip: '8.8.8.8' }]));

      // The ip-api url itself is no longer asserted here; it moved into
      // src/lib/ipApi.ts with the call.
      expect(ip.getIpInfo).toHaveBeenCalledWith('8.8.8.8');
      const saved = m.insertIps.mock.calls[0][1][0];
      expect(saved.ip).toBe('8.8.8.8');
      expect(saved.continent).toBe('Asia');
      expect(saved.country).toBe('Taiwan');
      expect(saved.region).toBe('Taipei');
      expect(saved.city).toBe('Taipei');
      expect(saved.mobile).toBe(false);
    });

    it('looks an ip up once per batch', async () => {
      await saveApiLog(
        db,
        event([{ ip: '8.8.8.8' }, { ip: '8.8.8.8' }, { ip: '8.8.8.8' }])
      );

      expect(ip.getIpInfo).toHaveBeenCalledTimes(1);
      expect(m.insertIps.mock.calls[0][1]).toHaveLength(1);
    });

    it('skips an ip already in the table', async () => {
      m.findIp.mockResolvedValue(knownIpRow);

      await saveApiLog(db, event([{}]));

      expect(ip.getIpInfo).not.toHaveBeenCalled();
      expect(m.insertIps).not.toHaveBeenCalled();
    });

    it('does not look anything up for a record with no ip', async () => {
      await saveApiLog(db, event([{ ip: null }]));

      expect(m.findIp).not.toHaveBeenCalled();
      expect(ip.getIpInfo).not.toHaveBeenCalled();
      expect(m.insertIps).not.toHaveBeenCalled();
    });

    it('does not touch the ip table when nothing new was found', async () => {
      m.findIp.mockResolvedValue(knownIpRow);

      await saveApiLog(db, event([{}, {}]));

      expect(m.insertIps).not.toHaveBeenCalled();
    });
  });

  // The `status: 'fail'` case that ip-api answers 200 with is translated into a
  // rejection inside src/lib/ipApi.ts, so from here it is indistinguishable
  // from any other failed lookup and is covered by the first case below. That
  // translation itself is no longer covered by a test -- testing it means
  // mocking axios, which is the thing that does not work.
  describe('ip-api failures are swallowed per record', () => {
    it('still writes the log row when the lookup rejects', async () => {
      ip.getIpInfo.mockRejectedValue(new Error('rate limited'));

      await saveApiLog(db, event([{}]));

      expect(m.insertIps).not.toHaveBeenCalled();
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(1);
    });

    it('lets a later record succeed after an earlier one failed', async () => {
      ip.getIpInfo
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({ ...ipInfo, query: '9.9.9.9' });

      await saveApiLog(db, event([{ ip: '8.8.8.8' }, { ip: '9.9.9.9' }]));

      expect(m.insertIps.mock.calls[0][1]).toHaveLength(1);
      expect(m.insertIps.mock.calls[0][1][0].ip).toBe('9.9.9.9');
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(2);
    });
  });
});
