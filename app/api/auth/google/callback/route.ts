import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  verifyGoogleToken,
  findOrCreateOAuthUser,
} from '@/lib/infrastructure/auth/oauth'
import { createSession } from '@/lib/infrastructure/auth/session'
import { extractUsername } from '@/lib/infrastructure/auth/types'
import { logger, withRouteTrace, withSpan } from '@/lib/core/logger'

const ROUTE_PATH = '/api/auth/google/callback'

function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/content'
  return value
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { searchParams } = new URL(request.url)
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')

      if (error) {
        return NextResponse.redirect(
          new URL('/sign-in?error=oauth_error', request.url)
        )
      }

      const cookieStore = await cookies()
      const storedState = cookieStore.get('oauth_state')?.value
      const storedRedirect = cookieStore.get('oauth_redirect')?.value

      if (!state || !storedState || state !== storedState) {
        return NextResponse.redirect(
          new URL('/sign-in?error=invalid_state', request.url)
        )
      }

      cookieStore.delete('oauth_state')
      cookieStore.delete('oauth_redirect')

      if (!code) {
        return NextResponse.redirect(
          new URL('/sign-in?error=no_code', request.url)
        )
      }

      const redirectUri = new URL('/api/auth/google/callback', request.url).toString()

      // Token exchange + verification + user-or-create wrapped in one span.
      // Code, idToken, accessToken, refreshToken are never logged in attrs.
      const { user } = await withSpan(
        { layer: 'auth', name: 'oauth_google_callback' },
        { summary: 'token exchange + user resolve' },
        async (span) => {
          const { idToken, accessToken, refreshToken, expiresIn, scope } = await exchangeCodeForTokens(
            code,
            redirectUri
          )

          const googleUser = await verifyGoogleToken(idToken)

          if (!googleUser.email || !googleUser.email_verified) {
            throw new Error('email_not_verified')
          }

          const username = extractUsername(googleUser.email)

          const result = await findOrCreateOAuthUser(
            'google',
            googleUser.sub,
            googleUser.email,
            username,
            accessToken,
            refreshToken,
            expiresIn,
            scope
          )
          span.attr('user_resolved', true)
          return result
        },
      )

      await createSession(user.id)

      const redirectTo = safeRedirectPath(storedRedirect || searchParams.get('redirect'))

      return NextResponse.redirect(new URL(redirectTo, request.url))
    } catch (error) {
      logger.error({
        layer: 'auth',
        event: 'oauth_google_callback:caught',
        summary: 'oauth callback failed — redirect to sign-in',
        error,
      })
      return NextResponse.redirect(
        new URL(
          `/sign-in?error=${encodeURIComponent(
            error instanceof Error ? error.message : 'oauth_error'
          )}`,
          request.url
        )
      )
    }
  })
}
