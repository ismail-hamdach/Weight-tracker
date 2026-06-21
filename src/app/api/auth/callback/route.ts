import { NextRequest, NextResponse } from 'next/server';
import { setSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    console.error('Google OAuth callback returned error:', error);
    return NextResponse.redirect(`${appUrl}?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}?auth_error=missing_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${appUrl}/api/auth/callback`;

  try {
    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Google Token exchange failed:', errText);
      return NextResponse.redirect(`${appUrl}?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // 2. Fetch user profile from Google UserInfo API
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch user profile info');
      return NextResponse.redirect(`${appUrl}?auth_error=failed_user_info`);
    }

    const userData = await userResponse.json();

    // 3. Initialize session object
    const sessionData: any = {
      user: {
        name: userData.name || userData.email,
        email: userData.email,
        picture: userData.picture || '',
      },
      accessToken: access_token,
      expiresAt: Date.now() + expires_in * 1000,
    };

    // Only save refresh token if it is returned (Google returns it on prompt=consent consent)
    if (refresh_token) {
      sessionData.refreshToken = refresh_token;
    }

    // 4. Save session in encrypted cookie
    await setSession(sessionData);

    return NextResponse.redirect(appUrl);
  } catch (err: any) {
    console.error('OAuth callback execution error:', err);
    return NextResponse.redirect(`${appUrl}?auth_error=${encodeURIComponent(err.message || String(err))}`);
  }
}
