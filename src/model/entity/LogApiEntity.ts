import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type LogApi = {
  id: number;
  project: string;
  resource: string;
  path: string;
  httpMethod: string;
  queryStringParameters: string | null;
  body: string | null;
  statusCode: string;
  elapsedTime: string;
  version: string | null;
  dateRequested: string;
  dateCreated: string;
};

@Entity({ name: 'log_api' })
export class LogApiEntity implements LogApi {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  project!: string;

  @Column({ type: 'varchar', length: 255 })
  resource!: string;

  @Column({ type: 'varchar', length: 255 })
  path!: string;

  @Column({ type: 'varchar', length: 16, name: 'http_method' })
  httpMethod!: string;

  @Column({ type: 'text', name: 'query_string_param' })
  queryStringParameters: string | null = null;

  @Column({ type: 'text' })
  body: string | null = null;

  @Column({ type: 'int', name: 'status_code' })
  statusCode!: string;

  @Column({ type: 'int', name: 'elapsed_time' })
  elapsedTime!: string;

  @Column({ type: 'varchar', length: 64 })
  version: string | null = null;

  @Column({ type: 'varchar', length: 64 })
  ip: string | null = null;

  @Column({ type: 'datetime', name: 'date_requested' })
  dateRequested!: string;

  @Column({ type: 'datetime', name: 'date_created' })
  dateCreated!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.dateCreated = new Date().toISOString();
  }
}
