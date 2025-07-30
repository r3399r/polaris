import axios from 'axios';
import { inject, injectable } from 'inversify';
import { IpAccess } from 'src/access/IpAccess';
import { LogApiAccess } from 'src/access/LogApiAccess';
import { QueueEvent } from 'src/model/Aws';
import { IpEntity } from 'src/model/entity/IpEntity';
import { LogApiEntity } from 'src/model/entity/LogApiEntity';
import { Ip } from 'src/model/Ip';
import { LoggerInput } from 'src/model/Logger';

/**
 * Service class for Logger
 */
@injectable()
export class LoggerService {
  @inject(LogApiAccess)
  private readonly logApiAccess!: LogApiAccess;
  @inject(IpAccess)
  private readonly ipAccess!: IpAccess;

  private async getIpInfo(ip: string) {
    const result = await axios.get<Ip>(
      `http://ip-api.com/json/${ip}?fields=1171481`
    );
    if (result.data.status === 'fail') throw new Error('ip-api failed');

    return result.data;
  }

  private async ipExists(ip: string) {
    const ipEntity = await this.ipAccess.findOne({ where: { ip } });

    return !!ipEntity;
  }

  public async saveApiLog(event: QueueEvent) {
    const ipEntities: IpEntity[] = [];
    const logApiEntities: LogApiEntity[] = [];

    for (const record of event.Records) {
      const data = JSON.parse(record.body) as LoggerInput;

      const ipExists = data.ip ? await this.ipExists(data.ip) : false;
      if (data.ip && !ipExists) {
        const ipInfo = await this.getIpInfo(data.ip);
        const ipEntity = new IpEntity();
        ipEntity.ip = data.ip;
        ipEntity.continent = ipInfo.continent;
        ipEntity.country = ipInfo.country;
        ipEntity.region = ipInfo.regionName;
        ipEntity.city = ipInfo.city;
        ipEntity.mobile = ipInfo.mobile;

        ipEntities.push(ipEntity);
      }

      const logApiEntity = new LogApiEntity();
      logApiEntity.project = data.project;
      logApiEntity.resource = data.resource;
      logApiEntity.path = data.path;
      logApiEntity.httpMethod = data.httpMethod;
      logApiEntity.queryStringParameters = data.queryStringParameters;
      logApiEntity.body = data.body;
      logApiEntity.statusCode = String(data.statusCode);
      logApiEntity.elapsedTime = String(data.elapsedTime);
      logApiEntity.version = data.version;
      logApiEntity.ip = data.ip;
      logApiEntity.dateRequested = data.dateRequested;

      logApiEntities.push(logApiEntity);
    }
    if (ipEntities.length > 0) await this.ipAccess.saveMany(ipEntities);
    await this.logApiAccess.saveMany(logApiEntities);
  }
}
