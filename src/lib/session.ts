import { cookies } from 'next/headers';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const COOKIE_NAME = 'weight_tracker_session';

function getSecretKey() {
  const secret = process.env.SESSION_SECRET || 'fallback-super-secret-key-32-chars-long';
  return crypto.scryptSync(secret, 'salt-session', 32);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string | null {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Session decryption failed:', error);
    return null;
  }
}

export interface UserSession {
  user: {
    name: string;
    email: string;
    picture: string;
  };
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // timestamp in ms
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const encryptedSession = cookieStore.get(COOKIE_NAME)?.value;
    if (!encryptedSession) return null;
    
    const decrypted = decrypt(encryptedSession);
    if (!decrypted) return null;

    const session = JSON.parse(decrypted) as UserSession;
    
    // Check if token needs to be refreshed (if expired or expiring within 5 minutes)
    const now = Date.now();
    if (session.expiresAt && now > session.expiresAt - 5 * 60 * 1000 && session.refreshToken) {
      console.log('Access token expiring, attempting refresh...');
      const newTokens = await refreshGoogleTokens(session.refreshToken);
      if (newTokens && newTokens.accessToken) {
        session.accessToken = newTokens.accessToken;
        session.expiresAt = Date.now() + newTokens.expiresIn * 1000;
        await setSession(session); // update cookie
      } else {
        // If refresh fails, clear session
        await clearSession();
        return null;
      }
    }
    
    return session;
  } catch (e) {
    console.error('Failed to parse or refresh session:', e);
    return null;
  }
}

export async function setSession(session: UserSession) {
  const serialized = JSON.stringify(session);
  const encrypted = encrypt(serialized);
  
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

interface GoogleTokenResponse {
  accessToken: string;
  expiresIn: number;
}

async function refreshGoogleTokens(refreshToken: string): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Google Client credentials missing for token refresh.');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Failed to refresh Google token:', errText);
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('Network error during Google token refresh:', error);
    return null;
  }
}
