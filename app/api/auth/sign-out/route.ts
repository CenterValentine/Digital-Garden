import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/infrastructure/auth/session'
import type { ApiResponse } from '@/lib/infrastructure/auth/types'
import { logger, withRouteTrace, withSpan } from '@/lib/core/logger'

const ROUTE_PATH = '/api/auth/sign-out'

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      await withSpan(
        { layer: 'auth', name: 'sign_out' },
        { summary: 'session delete' },
        async () => deleteSession(),
      )

      return NextResponse.json(
        {
          success: true,
          data: { success: true },
        } as ApiResponse<{ success: boolean }>,
        { status: 200 }
      )
    } catch (error) {
      logger.error({
        layer: 'auth',
        event: 'sign_out:caught',
        summary: 'sign-out failed — 500',
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
