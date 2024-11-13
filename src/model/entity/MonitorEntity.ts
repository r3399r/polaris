import { Column, Entity } from 'typeorm';

export type Monitor = {
  name: string;
  sql: string;
  refreshPeriod: string;
  append: boolean;
};

@Entity({ name: 'monitor' })
export class MonitorEntity implements Monitor {
  @Column({ primary: true })
  name!: string;

  @Column({ type: 'text' })
  sql!: string;

  @Column({ type: 'int8', name: 'refresh_period' })
  refreshPeriod!: string;

  @Column({ type: 'bool' })
  append!: boolean;
}
