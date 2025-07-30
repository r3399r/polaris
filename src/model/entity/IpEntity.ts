import { BeforeInsert, Column, Entity } from 'typeorm';

export type Ip = {
  ip: string;
  continent: string;
  country: string;
  region: string;
  city: string;
  mobile: boolean;
  dateCreated: string;
};

@Entity({ name: 'ip' })
export class IpEntity implements Ip {
  @Column({ primary: true, type: 'varchar', length: 64 })
  ip!: string;

  @Column({ type: 'varchar', length: 255 })
  continent!: string;

  @Column({ type: 'varchar', length: 255 })
  country!: string;

  @Column({ type: 'varchar', length: 255 })
  region!: string;

  @Column({ type: 'varchar', length: 255 })
  city!: string;

  @Column({ type: 'bool' })
  mobile!: boolean;

  @Column({ type: 'datetime', name: 'date_created' })
  dateCreated!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.dateCreated = new Date().toISOString();
  }
}
