import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/infrastructure/auth/session'
import type { ApiResponse, SessionData } from '@/lib/infrastructure/auth/types'
import { logger, withRouteTrace, withSpan } from '@/lib/core/logger'

const ROUTE_PATH = '/api/auth/session'

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: 'auth', name: 'session' },
        { summary: 'session lookup' },
        async () => getSession(),
      )
      const requiresSession = request.nextUrl.searchParams.get('required') === 'true'

      if (!session) {
        return NextResponse.json(
          {
            success: !requiresSession,
            ...(requiresSession
              ? {
                  error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                  },
                }
              : { data: null }),
          } as ApiResponse<null>,
          { status: requiresSession ? 401 : 200 }
        )
      }

      return NextResponse.json(
        {
          success: true,
          data: session,
        } as ApiResponse<SessionData>,
        { status: 200 }
      )
    } catch (error) {
      logger.error({
        layer: 'auth',
        event: 'session_read:caught',
        summary: 'session lookup failed — 500',
        error,
      })
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: error instanceof Error ? error.message : 'An error occurred',
          },
        } as ApiResponse<never>,
        { status: 500 }
      )
    }
  })
}
