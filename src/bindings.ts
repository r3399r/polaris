import 'reflect-metadata';
import { Container } from 'inversify';
import { DbAccess } from './access/DbAccess';
import { MonitorAccess } from './access/MonitorAccess';
import { LogApiAccess } from './access/MonitorAccess copy';
import { MonitorHisAccess } from './access/MonitorHisAccess';
import { GoogleApiService } from './logic/GoogleApiService';
import { LoggerService } from './logic/LoggerService';
import { MonitorService } from './logic/MonitorService';
import { LogApiEntity } from './model/entity/LogApiEntity';
import { MonitorEntity } from './model/entity/MonitorEntity';
import { MonitorHisEntity } from './model/entity/MonitorHisEntity';
import { Database, dbEntitiesBindingId } from './util/Database';

const container: Container = new Container();

container.bind<Database>(Database).toSelf().inSingletonScope();

// bind repeatedly for db entities
container.bind<Function>(dbEntitiesBindingId).toFunction(MonitorEntity);
container.bind<Function>(dbEntitiesBindingId).toFunction(MonitorHisEntity);
container.bind<Function>(dbEntitiesBindingId).toFunction(LogApiEntity);

// db access for tables
container.bind<DbAccess>(DbAccess).toSelf();
container.bind<MonitorAccess>(MonitorAccess).toSelf();
container.bind<MonitorHisAccess>(MonitorHisAccess).toSelf();
container.bind<LogApiAccess>(LogApiAccess).toSelf();

// service
container.bind<MonitorService>(MonitorService).toSelf();
container.bind<GoogleApiService>(GoogleApiService).toSelf().inSingletonScope();
container.bind<LoggerService>(LoggerService).toSelf().inSingletonScope();

// AWS
// container.bind<SES>(SES).toDynamicValue(() => new SES());

export { container as bindings };
