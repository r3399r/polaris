import { BeforeInsert, Column, Entity, Generated } from 'typeorm';

export type MonitorHis = {
  id: string;
  name: string;
  rowCount: string;
  elapsedTime: number;
  dateCreated: string;
};

@Entity({ name: 'monitor_his' })
export class MonitorHisEntity implements MonitorHis {
  @Column({ primary: true })
  @Generated('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', name: 'row_count' })
  rowCount!: string;

  @Column({ type: 'float', name: 'elapsed_time' })
  elapsedTime!: number;

  @Column({ type: 'timestamp', name: 'date_created', default: null })
  dateCreated!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.dateCreated = new Date().toISOString();
  }
}
