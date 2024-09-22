import { ViewColumn, ViewEntity } from 'typeorm';

export type MBook = {
  id: string;
  dateCreated: string;
};

@ViewEntity({ name: 'm_book', schema: 'spica' })
export class MBookEntity implements MBook {
  @ViewColumn()
  id!: string;

  @ViewColumn({ name: 'date_created' })
  dateCreated!: string;
}
