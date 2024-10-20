import { BeforeInsert, Column, Entity, Generated } from 'typeorm';

export type LogApi = {
  id: string;
  project: string;
  resource: string;
  path: string;
  httpMethod: string;
  queryStringParameters: string | null;
  body: string | null;
  statusCode: string;
  elapsedTime: string;
  version:string |null;
  dateRequested: string;
  dateCreated: string;
};

@Entity({ name: 'log_api' })
export class LogApiEntity implements LogApi {
  @Column({ primary: true })
  @Generated('uuid')
  id!: string;

  @Column({ type: 'text' })
  project!: string;

  @Column({ type: 'text' })
  resource!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'text', name: 'http_method' })
  httpMethod!: string;

  @Column({ type: 'text', name: 'query_string_param' })
  queryStringParameters: string | null = null;

  @Column({ type: 'text' })
  body: string | null = null;

  @Column({ type: 'int8', name: 'status_code' })
  statusCode!: string;

  @Column({ type: 'int8', name: 'elapsed_time' })
  elapsedTime!: string;

  @Column({ type: 'text' })
  version: string | null = null;

  @Column({ type: 'timestamp', name: 'date_requested' })
  dateRequested!: string;

  @Column({ type: 'timestamp', name: 'date_created' })
  dateCreated!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.dateCreated = new Date().toISOString();
  }
}
