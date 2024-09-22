import { inject, injectable } from 'inversify';
import { MBookAccess } from 'src/access/spica/MBookAccess';
import { MBook } from 'src/model/entity/spica/MBookEntity';
import { GoogleApiService } from './GoogleApiService';

/**
 * Service class for Monitor
 */
@injectable()
export class MonitorService {
  @inject(MBookAccess)
  private readonly mBookAccess!: MBookAccess;

  @inject(GoogleApiService)
  private readonly googleApiService!: GoogleApiService;

  public async saveDataToGoogleSheet() {
    const count = await this.mBookAccess.count();
    const rowsPerQuery = 200;
    const data: MBook[] = [];
    for (let i = 0; i < count; i += rowsPerQuery) {
      const rows = await this.mBookAccess.find({
        skip: i,
        take: rowsPerQuery,
      });
      data.push(...rows);
    }

    // save to google sheet
    const sheet = await this.googleApiService.getSheet('m_book');
    await sheet.clear();
    await sheet.setHeaderRow(['id', 'dateCreated']);
    await sheet.addRows(data);
  }
}
