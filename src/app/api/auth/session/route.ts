import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    // Read linked spreadsheet ID from separate secure cookie
    const cookieStore = await cookies();
    const spreadsheetId = cookieStore.get('weight_tracker_sheet_id')?.value || '';

    return NextResponse.json({
      authenticated: true,
      user: session.user,
      spreadsheetId,
    });
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json({ authenticated: false, error: 'Internal Error' }, { status: 500 });
  }
}
