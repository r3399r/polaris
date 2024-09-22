import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { injectable } from 'inversify';

/**
 * Service class for google api.
 */
@injectable()
export class GoogleApiService {
  private spreadsheet: GoogleSpreadsheet | undefined;

  public async getSheet(title?: string) {
    if (this.spreadsheet === undefined) {
      this.spreadsheet = new GoogleSpreadsheet(
        process.env.SHEET_ID ?? '',
        new JWT({
          email: process.env.CLIENT_EMAIL,
          key: (process.env.PRIVATE_KEY ?? '').replace(/\*\*/g, '\n'),
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })
      );

      await this.spreadsheet.loadInfo();
    }

    if (title) return this.spreadsheet.sheetsByTitle[title];

    return this.spreadsheet.sheetsByIndex[0];
  }
}
