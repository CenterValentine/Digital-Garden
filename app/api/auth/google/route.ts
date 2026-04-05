import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 500 }
    )
  }

  // Generate state for CSRF protection
  const state = uuidv4()

  // Get redirect URI
  const redirectUri = new URL('/api/auth/google/callback', request.url).toString()

  // Build OAuth URL
  // Request Google Drive scope for document editing
  // Note: Using 'drive' instead of 'drive.file' to allow full Drive access
  // This is needed so files can be accessed via iframe and opened in Google Docs/Sheets
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/drive',
    state,
    access_type: 'offline',
    prompt: 'consent',
  })

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`

  const response = NextResponse.redirect(authUrl)

  // Set cookie on the response directly — cookies().set() in a redirect handler
  // may not attach to the redirect response in all Next.js App Router versions.
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}

