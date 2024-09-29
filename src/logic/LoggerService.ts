import { inject, injectable } from 'inversify';
import { LogApiAccess } from 'src/access/MonitorAccess copy';
import { LogApiEntity } from 'src/model/entity/LogApiEntity';
import { LoggerInput } from 'src/model/Logger';

/**
 * Service class for Logger
 */
@injectable()
export class LoggerService {
  @inject(LogApiAccess)
  private readonly logApiAccess!: LogApiAccess;

  public async saveApiLog(data: LoggerInput) {
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
    await this.logApiAccess.save(logApiEntity);
  }
}
