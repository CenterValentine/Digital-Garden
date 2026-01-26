import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  isValidEmail,
  type ApiResponse,
  type SignInInput,
  type SessionData,
} from "@/lib/auth/types";

import { prisma } from "@/lib/database/client";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    // Validate request body
    if (
      !body ||
      typeof body !== "object" ||
      !("email" in body) ||
      !("password" in body)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid request body",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    const input = body as SignInInput;

    // Validate email
    if (!isValidEmail(input.email)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_EMAIL",
            message: "Invalid email address",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        } as ApiResponse<never>,
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(input.password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        } as ApiResponse<never>,
        { status: 401 }
      );
    }

    // Create session
    const session = await createSession(user.id);

    return NextResponse.json(
      {
        success: true,
        data: session,
      } as ApiResponse<SessionData>,
      { status: 200 }
    );
  } catch (error) {
    console.error("Sign-in error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: error instanceof Error ? error.message : "An error occurred",
        },
      } as ApiResponse<never>,
      { status: 500 }
    );
  }
}
