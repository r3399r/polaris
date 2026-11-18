import axios from 'axios';
import * as mysql from 'src/db/queries/mysql';
import { MysqlDb } from 'src/db/queries/mysql';
import { saveApiLog } from 'src/logic/LoggerService';
import { QueueEvent } from 'src/model/Aws';
import { LoggerInput } from 'src/model/Logger';

jest.mock('axios');
jest.mock('src/db/queries/mysql');
const mockedAxios = jest.mocked(axios);
const m = jest.mocked(mysql);

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

const event = (overrides: Partial<LoggerInput>[]): QueueEvent =>
  ({
    Records: overrides.map((o, i) => ({
      messageId: String(i),
      body: JSON.stringify({ ...baseInput, ...o }),
    })),
  }) as unknown as QueueEvent;

describe('LoggerService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedAxios.get.mockReset().mockResolvedValue({ data: ipInfo });

    m.findIp.mockReset().mockResolvedValue(undefined);
    m.insertIps.mockReset().mockResolvedValue(undefined);
    m.insertLogApi.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

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

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://ip-api.com/json/8.8.8.8?fields=1171481'
      );
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

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(m.insertIps.mock.calls[0][1]).toHaveLength(1);
    });

    it('skips an ip already in the table', async () => {
      m.findIp.mockResolvedValue({
        ip: '1.1.1.1',
        continent: 'Asia',
        country: 'Taiwan',
        region: 'Taipei',
        city: 'Taipei',
        mobile: false,
        dateCreated: new Date(),
      });

      await saveApiLog(db, event([{}]));

      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(m.insertIps).not.toHaveBeenCalled();
    });

    it('does not look anything up for a record with no ip', async () => {
      await saveApiLog(db, event([{ ip: null }]));

      expect(m.findIp).not.toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(m.insertIps).not.toHaveBeenCalled();
    });

    it('does not touch the ip table when nothing new was found', async () => {
      m.findIp.mockResolvedValue({
        ip: '1.1.1.1',
        continent: 'Asia',
        country: 'Taiwan',
        region: 'Taipei',
        city: 'Taipei',
        mobile: false,
        dateCreated: new Date(),
      });

      await saveApiLog(db, event([{}, {}]));

      expect(m.insertIps).not.toHaveBeenCalled();
    });
  });

  describe('ip-api failures are swallowed per record', () => {
    it('still writes the log row when the lookup rejects', async () => {
      mockedAxios.get.mockRejectedValue(new Error('rate limited'));

      await saveApiLog(db, event([{}]));

      expect(m.insertIps).not.toHaveBeenCalled();
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(1);
    });

    it('treats a status of fail as a failure', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { ...ipInfo, status: 'fail', message: 'reserved range' },
      });

      await saveApiLog(db, event([{}]));

      expect(m.insertIps).not.toHaveBeenCalled();
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(1);
    });

    it('lets a later record succeed after an earlier one failed', async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({ data: { ...ipInfo, query: '9.9.9.9' } });

      await saveApiLog(db, event([{ ip: '8.8.8.8' }, { ip: '9.9.9.9' }]));

      expect(m.insertIps.mock.calls[0][1]).toHaveLength(1);
      expect(m.insertIps.mock.calls[0][1][0].ip).toBe('9.9.9.9');
      expect(m.insertLogApi.mock.calls[0][1]).toHaveLength(2);
    });
  });
});
