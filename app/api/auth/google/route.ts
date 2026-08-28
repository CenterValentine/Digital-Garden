import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getGoogleOAuthScopesForRequest } from '@/lib/extensions'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/content'
  return value
}

/**
 * Decide whether to force Google's (two-screen) consent flow.
 *
 * `prompt=consent` is the only way Google mints a fresh refresh token for a
 * returning user, so we force it exactly when that matters:
 *  - `?reauth=1` — the stored refresh token is dead (`GoogleAuthError` code
 *    "reauth_required"); the client's Reconnect toast points here.
 *  - extension scopes — this request asks for more than the user's baseline
 *    grant (e.g. Calendar), so they must see what changed, and the new grant
 *    re-issues tokens for the widened scope set.
 *
 * Otherwise omit `prompt` entirely: Google silently passes a returning user
 * through with zero interstitials, and the callback keeps the stored refresh
 * token (findOrCreateOAuthUser falls back to the existing one).
 */
function resolvePrompt(input: {
  reauthRequested: boolean
  extensionScopeCount: number
}): 'consent' | undefined {
  if (input.reauthRequested) return 'consent'
  if (input.extensionScopeCount > 0) return 'consent'
  return undefined
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 500 }
    )
  }

  // Generate state for CSRF protection
  const state = uuidv4()
  const redirectTo = safeRedirectPath(request.nextUrl.searchParams.get('redirect'))
  const requestedScope = request.nextUrl.searchParams.get('scope') || ''
  const requestedScopes = requestedScope
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
  const scopes = new Set([
    'openid',
    'email',
    'profile',
    GOOGLE_DRIVE_SCOPE,
  ])

  // Track how many scopes extensions add beyond the baseline — a non-zero
  // count means this is a scope upgrade and consent must be shown.
  let extensionScopeCount = 0
  for (const scope of getGoogleOAuthScopesForRequest({
    redirectPath: redirectTo,
    requestedScopes,
  })) {
    if (!scopes.has(scope)) extensionScopeCount += 1
    scopes.add(scope)
  }

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
    scope: Array.from(scopes).join(' '),
    state,
    access_type: 'offline',
    include_granted_scopes: 'true',
  })

  const prompt = resolvePrompt({
    reauthRequested: request.nextUrl.searchParams.get('reauth') === '1',
    extensionScopeCount,
  })
  if (prompt) params.set('prompt', prompt)

  // Skip Google's account chooser for returning users on this browser.
  // The cookie is set by the callback route after a successful sign-in.
  const loginHint = request.cookies.get('last_google_email')?.value
  if (loginHint) params.set('login_hint', loginHint)

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
  response.cookies.set('oauth_redirect', redirectTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
