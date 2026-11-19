import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

let spreadsheet: GoogleSpreadsheet | undefined;

/**
 * The spreadsheet is cached for the lifetime of the execution environment, so
 * loadInfo() runs once per warm container.
 *
 * PRIVATE_KEY stores its newlines as `**` because a CloudFormation SSM
 * parameter cannot carry a real newline; they are put back here.
 *
 * A missing tab is created and then looked up again, relying on addSheet()
 * refreshing sheetsByTitle. A tab added out-of-band mid-container is not seen.
 */
export const getSheet = async (title: string) => {
  if (spreadsheet === undefined) {
    spreadsheet = new GoogleSpreadsheet(
      process.env.SHEET_ID ?? '',
      new JWT({
        email: process.env.CLIENT_EMAIL,
        key: (process.env.PRIVATE_KEY ?? '').replace(/\*\*/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    );

    await spreadsheet.loadInfo();
  }

  const sheet = spreadsheet.sheetsByTitle[title];
  if (!sheet) await spreadsheet.addSheet({ title });

  return spreadsheet.sheetsByTitle[title];
};
