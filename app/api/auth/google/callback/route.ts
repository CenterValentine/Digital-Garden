import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  verifyGoogleToken,
  findOrCreateOAuthUser,
} from '@/lib/infrastructure/auth/oauth'
import { createSession } from '@/lib/infrastructure/auth/session'
import { extractUsername } from '@/lib/infrastructure/auth/types'

function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/content'
  return value
}

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL('/sign-in?error=oauth_error', request.url)
      )
    }

    // Validate state (CSRF protection)
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth_state')?.value
    const storedRedirect = cookieStore.get('oauth_redirect')?.value

    if (!state || !storedState || state !== storedState) {
      return NextResponse.redirect(
        new URL('/sign-in?error=invalid_state', request.url)
      )
    }

    // Clear state cookie
    cookieStore.delete('oauth_state')
    cookieStore.delete('oauth_redirect')

    if (!code) {
      return NextResponse.redirect(
        new URL('/sign-in?error=no_code', request.url)
      )
    }

    // Get redirect URI
    const redirectUri = new URL('/api/auth/google/callback', request.url).toString()

    // Exchange code for tokens
    const { idToken, accessToken, refreshToken, expiresIn, scope } = await exchangeCodeForTokens(
      code,
      redirectUri
    )

    // Verify ID token
    const googleUser = await verifyGoogleToken(idToken)

    if (!googleUser.email || !googleUser.email_verified) {
      return NextResponse.redirect(
        new URL('/sign-in?error=email_not_verified', request.url)
      )
    }

    // Extract username from email
    const username = extractUsername(googleUser.email)

    // Find or create user with OAuth tokens
    const { user } = await findOrCreateOAuthUser(
      'google',
      googleUser.sub,
      googleUser.email,
      username,
      accessToken,
      refreshToken,
      expiresIn,
      scope
    )

    // Create session
    await createSession(user.id)

    // Get redirect URL (default to content page)
    const redirectTo = safeRedirectPath(storedRedirect || searchParams.get('redirect'))

    return NextResponse.redirect(new URL(redirectTo, request.url))
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(
        `/sign-in?error=${encodeURIComponent(
          error instanceof Error ? error.message : 'oauth_error'
        )}`,
        request.url
      )
    )
  }
}
