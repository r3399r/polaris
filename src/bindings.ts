import 'reflect-metadata';
import { Container } from 'inversify';
import { DbAccess } from './access/DbAccess';
import { MBookAccess } from './access/spica/MBookAccess';
import { GoogleApiService } from './logic/GoogleApiService';
import { MonitorService } from './logic/MonitorService';
import { MBookEntity } from './model/entity/spica/MBookEntity';
import { Database, dbEntitiesBindingId } from './util/Database';

const container: Container = new Container();

container.bind<Database>(Database).toSelf().inSingletonScope();

// bind repeatedly for db entities
container.bind<Function>(dbEntitiesBindingId).toFunction(MBookEntity);

// db access for tables
container.bind<DbAccess>(DbAccess).toSelf();
container.bind<MBookAccess>(MBookAccess).toSelf();

// service
container.bind<MonitorService>(MonitorService).toSelf();
container.bind<GoogleApiService>(GoogleApiService).toSelf().inSingletonScope();

// AWS
// container.bind<SES>(SES).toDynamicValue(() => new SES());

export { container as bindings };
