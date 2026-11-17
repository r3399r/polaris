import { BeforeInsert, Column, Entity, Generated } from 'typeorm';

export type MonitorHis = {
  id: string;
  name: string;
  rowCount: string | null;
  elapsedTime: number | null;
  success: boolean;
  dateCreated: string;
};

@Entity({ name: 'monitor_his' })
export class MonitorHisEntity implements MonitorHis {
  @Column({ primary: true })
  @Generated('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', name: 'row_count', default: null })
  rowCount: string | null = null;

  @Column({ type: 'float', name: 'elapsed_time', default: null })
  elapsedTime: number | null = null;

  @Column({ type: 'bool' })
  success!: boolean;

  @Column({ type: 'timestamp', name: 'date_created', default: null })
  dateCreated!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.dateCreated = new Date().toISOString();
  }
}
