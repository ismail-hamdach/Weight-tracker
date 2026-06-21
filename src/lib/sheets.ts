import { google } from 'googleapis';

export interface WeightLog {
  date: string;
  weight: number;
}

// Get standard OAuth2 Client configured with user's access token
function getOAuthSheetsClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
}

// Automatically create a new weight tracking spreadsheet in the user's Drive
export async function createUserSpreadsheet(accessToken: string): Promise<string> {
  const sheets = getOAuthSheetsClient(accessToken);
  
  try {
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'WeightTracker',
        },
        sheets: [
          {
            properties: {
              title: 'Sheet1',
            },
          },
        ],
      },
    });

    const spreadsheetId = response.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID was not returned by Google API.');
    }

    // Initialize headers in the new sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1:B1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Date', 'Weight']],
      },
    });

    return spreadsheetId;
  } catch (error) {
    console.error('Failed to create spreadsheet on behalf of user:', error);
    throw error;
  }
}

// Fetch weight logs from the user's spreadsheet
export async function getUserWeightLogs(
  accessToken: string,
  spreadsheetId: string
): Promise<{ data: WeightLog[]; success: boolean }> {
  if (!spreadsheetId) {
    return { data: [], success: false };
  }

  const sheets = getOAuthSheetsClient(accessToken);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:B', // Assumes headers on row 1 (Date, Weight)
    });

    const rows = response.data.values || [];
    const parsedLogs = rows
      .map((row) => ({
        date: String(row[0] || '').split('T')[0],
        weight: parseFloat(row[1]) || 0,
      }))
      .filter((item) => item.date && !isNaN(item.weight) && item.weight > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { data: parsedLogs, success: true };
  } catch (error: any) {
    console.warn('Error reading from user Sheets API:', error.message);
    // If table doesn't have records yet, it might return 400. We return empty list.
    return { data: [], success: true };
  }
}

// Append new log to the user's spreadsheet
export async function addUserWeightLog(
  accessToken: string,
  spreadsheetId: string,
  date: string,
  weight: number
): Promise<{ success: boolean }> {
  if (!spreadsheetId) {
    throw new Error('No Google Sheet has been linked to this account.');
  }

  const sheets = getOAuthSheetsClient(accessToken);

  try {
    // Check if headers exist first
    let needsHeaders = false;
    try {
      const checkRange = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Sheet1!A1:B1',
      });
      if (!checkRange.data.values || checkRange.data.values.length === 0) {
        needsHeaders = true;
      }
    } catch (e) {
      needsHeaders = true;
    }

    if (needsHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:B1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Date', 'Weight']],
        },
      });
    }

    // Append weight log
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:B',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[date, weight]],
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error appending weight to user Sheets API:', error);
    throw error;
  }
}
