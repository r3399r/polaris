import { inject, injectable } from 'inversify';
import { LogApiAccess } from 'src/access/LogApiAccess';
import { QueueEvent } from 'src/model/Aws';
import { LogApiEntity } from 'src/model/entity/LogApiEntity';
import { LoggerInput } from 'src/model/Logger';

/**
 * Service class for Logger
 */
@injectable()
export class LoggerService {
  @inject(LogApiAccess)
  private readonly logApiAccess!: LogApiAccess;

  public async saveApiLog(event: QueueEvent) {
    const logApiEntities: LogApiEntity[] = [];

    for (const record of event.Records) {
      const data = JSON.parse(record.body) as LoggerInput;

      const logApiEntity = new LogApiEntity();
      logApiEntity.project = data.project;
      logApiEntity.resource = data.resource;
      logApiEntity.path = data.path;
      logApiEntity.httpMethod = data.httpMethod;
      logApiEntity.queryStringParameters = data.queryStringParameters;
      logApiEntity.body = data.body;
      logApiEntity.statusCode = String(data.statusCode);
      logApiEntity.elapsedTime = String(data.elapsedTime);
      logApiEntity.dateRequested = data.dateRequested;

      logApiEntities.push(logApiEntity);
    }
    await this.logApiAccess.saveMany(logApiEntities);
  }
}
