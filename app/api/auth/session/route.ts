import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import type { ApiResponse, SessionData } from '@/lib/auth/types'

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SessionData | null>>> {
  try {
    const session = await getSession()

    if (!session) {
      return NextResponse.json(
        {
          success: true,
          data: null,
        } as ApiResponse<null>,
        { status: 200 }
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
    console.error('Session error:', error)
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
}

