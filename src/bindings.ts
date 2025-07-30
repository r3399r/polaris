import 'reflect-metadata';
import { Container } from 'inversify';
import { CockroachDbAccess } from './access/CockroachDbAccess';
import { IpAccess } from './access/IpAccess';
import { LogApiAccess } from './access/LogApiAccess';
import { MonitorAccess } from './access/MonitorAccess';
import { MonitorHisAccess } from './access/MonitorHisAccess';
import { MySqlDbAccess } from './access/MySqlDbAccess';
import { GoogleApiService } from './logic/GoogleApiService';
import { HouseKeepingService } from './logic/HouseKeepingService';
import { LoggerService } from './logic/LoggerService';
import { MonitorService } from './logic/MonitorService';
import { IpEntity } from './model/entity/IpEntity';
import { LogApiEntity } from './model/entity/LogApiEntity';
import { MonitorEntity } from './model/entity/MonitorEntity';
import { MonitorHisEntity } from './model/entity/MonitorHisEntity';
import {
  CockroachDatabase,
  cockroachDbEntitiesBindingId,
} from './util/CockroachDatabase';
import { MySqlDatabase, mySqlDbEntitiesBindingId } from './util/MySqlDatabase';

const container: Container = new Container();

container
  .bind<CockroachDatabase>(CockroachDatabase)
  .toSelf()
  .inSingletonScope();
container.bind<MySqlDatabase>(MySqlDatabase).toSelf().inSingletonScope();

// bind repeatedly for db entities
container
  .bind<Function>(cockroachDbEntitiesBindingId)
  .toFunction(MonitorEntity);
container
  .bind<Function>(cockroachDbEntitiesBindingId)
  .toFunction(MonitorHisEntity);
container.bind<Function>(mySqlDbEntitiesBindingId).toFunction(LogApiEntity);
container.bind<Function>(mySqlDbEntitiesBindingId).toFunction(IpEntity);

// db access for tables
container.bind<CockroachDbAccess>(CockroachDbAccess).toSelf();
container.bind<MySqlDbAccess>(MySqlDbAccess).toSelf();
container.bind<MonitorAccess>(MonitorAccess).toSelf();
container.bind<MonitorHisAccess>(MonitorHisAccess).toSelf();
container.bind<LogApiAccess>(LogApiAccess).toSelf();
container.bind<IpAccess>(IpAccess).toSelf();

// service
container.bind<MonitorService>(MonitorService).toSelf();
container.bind<GoogleApiService>(GoogleApiService).toSelf().inSingletonScope();
container.bind<LoggerService>(LoggerService).toSelf();
container.bind<HouseKeepingService>(HouseKeepingService).toSelf();

// AWS
// container.bind<SES>(SES).toDynamicValue(() => new SES());

export { container as bindings };
