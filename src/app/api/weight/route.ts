import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { cookies } from 'next/headers';
import {
  getUserWeightLogs,
  addUserWeightLog,
  createUserSpreadsheet,
} from '@/lib/sheets';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      // User is logged out -> Client will run in Local Storage Demo Mode
      return NextResponse.json({
        data: [],
        isConfigured: false,
        authenticated: false,
      });
    }

    const cookieStore = await cookies();
    const spreadsheetId = cookieStore.get('weight_tracker_sheet_id')?.value;

    if (!spreadsheetId) {
      // Logged in but has not created or linked a sheet yet
      return NextResponse.json({
        data: [],
        isConfigured: false,
        authenticated: true,
      });
    }

    const result = await getUserWeightLogs(session.accessToken, spreadsheetId);
    return NextResponse.json({
      data: result.data,
      isConfigured: true,
      authenticated: true,
    });
  } catch (error: any) {
    console.error('API GET /api/weight error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required to access Google Sheets.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, date, weight, spreadsheetId } = body;

    const cookieStore = await cookies();

    // Action A: Create new sheet automatically
    if (action === 'create_sheet') {
      const newSheetId = await createUserSpreadsheet(session.accessToken);
      
      // Store spreadsheet ID in long-lived cookie (365 days)
      cookieStore.set('weight_tracker_sheet_id', newSheetId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      });

      return NextResponse.json({ success: true, spreadsheetId: newSheetId });
    }

    // Action B: Link an existing sheet
    if (action === 'link_sheet') {
      if (!spreadsheetId) {
        return NextResponse.json({ error: 'Spreadsheet ID/URL is required.' }, { status: 400 });
      }

      // Extract raw ID if full URL was pasted
      let rawId = spreadsheetId.trim();
      const match = rawId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        rawId = match[1];
      }

      // Test access
      const test = await getUserWeightLogs(session.accessToken, rawId);
      if (!test.success) {
        return NextResponse.json(
          { error: 'Unable to access the specified sheet. Please verify the ID/URL and check authorization.' },
          { status: 400 }
        );
      }

      // Store in cookie
      cookieStore.set('weight_tracker_sheet_id', rawId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      });

      return NextResponse.json({ success: true, spreadsheetId: rawId });
    }

    // Action C: Unlink current sheet
    if (action === 'unlink_sheet') {
      cookieStore.delete('weight_tracker_sheet_id');
      return NextResponse.json({ success: true });
    }

    // Default Action: Append a log
    const currentSpreadsheetId = cookieStore.get('weight_tracker_sheet_id')?.value;
    if (!currentSpreadsheetId) {
      return NextResponse.json({ error: 'No Google Sheet is linked.' }, { status: 400 });
    }

    if (!date || !weight || isNaN(parseFloat(weight))) {
      return NextResponse.json({ error: 'Valid date and weight are required.' }, { status: 400 });
    }

    await addUserWeightLog(
      session.accessToken,
      currentSpreadsheetId,
      date,
      parseFloat(weight)
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API POST /api/weight error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete action' },
      { status: 500 }
    );
  }
}
