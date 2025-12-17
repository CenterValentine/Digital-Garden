import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth/session'
import type { ApiResponse } from '@/lib/auth/types'

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  try {
    await deleteSession()

    return NextResponse.json(
      {
        success: true,
        data: { success: true },
      } as ApiResponse<{ success: boolean }>,
      { status: 200 }
    )
  } catch (error) {
    console.error('Sign-out error:', error)
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

