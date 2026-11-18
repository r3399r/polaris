import 'reflect-metadata';
import axios from 'axios';
import { Container } from 'inversify';
import { IpAccess } from 'src/access/IpAccess';
import { LogApiAccess } from 'src/access/LogApiAccess';
import { LoggerService } from 'src/logic/LoggerService';
import { QueueEvent } from 'src/model/Aws';
import { LoggerInput } from 'src/model/Logger';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
  let container: Container;
  let service: LoggerService;
  let logApiAccess: { saveMany: jest.Mock };
  let ipAccess: { findOne: jest.Mock; saveMany: jest.Mock };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedAxios.get.mockResolvedValue({ data: ipInfo });

    logApiAccess = { saveMany: jest.fn() };
    ipAccess = {
      findOne: jest.fn().mockResolvedValue(undefined),
      saveMany: jest.fn(),
    };

    container = new Container();
    container.bind<any>(LogApiAccess).toConstantValue(logApiAccess);
    container.bind<any>(IpAccess).toConstantValue(ipAccess);
    container.bind<LoggerService>(LoggerService).toSelf();
    service = container.get(LoggerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedAxios.get.mockReset();
  });

  describe('log rows', () => {
    it('writes one row per record, always', async () => {
      await service.saveApiLog(event([{}, {}, {}]));

      expect(logApiAccess.saveMany).toHaveBeenCalledTimes(1);
      expect(logApiAccess.saveMany.mock.calls[0][0]).toHaveLength(3);
    });

    it('stringifies the numeric columns', async () => {
      await service.saveApiLog(event([{ statusCode: 404, elapsedTime: 1234 }]));

      const row = logApiAccess.saveMany.mock.calls[0][0][0];
      expect(row.statusCode).toBe('404');
      expect(row.elapsedTime).toBe('1234');
    });

    it('carries the rest of the payload through unchanged', async () => {
      await service.saveApiLog(
        event([{ project: 'castor', path: '/q/7', body: '{"a":1}' }])
      );

      const row = logApiAccess.saveMany.mock.calls[0][0][0];
      expect(row.project).toBe('castor');
      expect(row.path).toBe('/q/7');
      expect(row.body).toBe('{"a":1}');
      expect(row.dateRequested).toBe(baseInput.dateRequested);
    });

    // Current behaviour: an empty batch still reaches the access layer.
    it('calls saveMany even with no records', async () => {
      await service.saveApiLog(event([]));
      expect(logApiAccess.saveMany).toHaveBeenCalledWith([]);
    });
  });

  describe('ip enrichment', () => {
    it('looks up and stores an unseen ip', async () => {
      await service.saveApiLog(event([{ ip: '8.8.8.8' }]));

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://ip-api.com/json/8.8.8.8?fields=1171481'
      );
      const saved = ipAccess.saveMany.mock.calls[0][0][0];
      expect(saved.ip).toBe('8.8.8.8');
      expect(saved.continent).toBe('Asia');
      expect(saved.country).toBe('Taiwan');
      expect(saved.region).toBe('Taipei');
      expect(saved.city).toBe('Taipei');
      expect(saved.mobile).toBe(false);
    });

    it('looks an ip up once per batch', async () => {
      await service.saveApiLog(
        event([{ ip: '8.8.8.8' }, { ip: '8.8.8.8' }, { ip: '8.8.8.8' }])
      );

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(ipAccess.saveMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('skips an ip already in the table', async () => {
      ipAccess.findOne.mockResolvedValue({ ip: '1.1.1.1' });

      await service.saveApiLog(event([{}]));

      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(ipAccess.saveMany).not.toHaveBeenCalled();
    });

    it('does not look anything up for a record with no ip', async () => {
      await service.saveApiLog(event([{ ip: null }]));

      expect(ipAccess.findOne).not.toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(ipAccess.saveMany).not.toHaveBeenCalled();
    });

    it('does not touch the ip table when nothing new was found', async () => {
      ipAccess.findOne.mockResolvedValue({ ip: '1.1.1.1' });
      await service.saveApiLog(event([{}, {}]));
      expect(ipAccess.saveMany).not.toHaveBeenCalled();
    });
  });

  describe('ip-api failures are swallowed per record', () => {
    it('still writes the log row when the lookup rejects', async () => {
      mockedAxios.get.mockRejectedValue(new Error('rate limited'));

      await service.saveApiLog(event([{}]));

      expect(ipAccess.saveMany).not.toHaveBeenCalled();
      expect(logApiAccess.saveMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('treats a status of fail as a failure', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { ...ipInfo, status: 'fail', message: 'reserved range' },
      });

      await service.saveApiLog(event([{}]));

      expect(ipAccess.saveMany).not.toHaveBeenCalled();
      expect(logApiAccess.saveMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('lets a later record succeed after an earlier one failed', async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({ data: { ...ipInfo, query: '9.9.9.9' } });

      await service.saveApiLog(event([{ ip: '8.8.8.8' }, { ip: '9.9.9.9' }]));

      expect(ipAccess.saveMany.mock.calls[0][0]).toHaveLength(1);
      expect(ipAccess.saveMany.mock.calls[0][0][0].ip).toBe('9.9.9.9');
      expect(logApiAccess.saveMany.mock.calls[0][0]).toHaveLength(2);
    });
  });
});
