import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  extractUsername,
  isValidEmail,
  isValidPassword,
  type ApiResponse,
  type SignUpInput,
  type SessionData,
  type AuthError,
} from "@/lib/auth/types";

import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    // Validate request body
    if (
      !body ||
      typeof body !== "object" ||
      !("email" in body) ||
      !("password" in body) ||
      !("passwordConfirm" in body)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_EMAIL",
            message: "Invalid request body",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    const input = body as SignUpInput;

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

    // Validate password
    if (!isValidPassword(input.password)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "WEAK_PASSWORD",
            message: "Password must be at least 8 characters long",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    // Check password confirmation
    if (input.password !== input.passwordConfirm) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "WEAK_PASSWORD",
            message: "Passwords do not match",
          },
        } as ApiResponse<never>,
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "USER_EXISTS",
            message: "User with this email already exists",
          },
        } as ApiResponse<never>,
        { status: 409 }
      );
    }

    // Extract username from email
    let username = extractUsername(input.email);

    // Check if username is taken and generate unique one if needed
    let existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      // Append numbers if username is taken
      let counter = 1;
      let uniqueUsername = `${username}${counter}`;
      while (
        await prisma.user.findUnique({ where: { username: uniqueUsername } })
      ) {
        counter++;
        uniqueUsername = `${username}${counter}`;
      }
      // Ensure length limit
      username = uniqueUsername.substring(0, 50);
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: input.email,
        username,
        passwordHash,
        role: "guest",
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    // Create session
    const session = await createSession(user.id);

    return NextResponse.json(
      {
        success: true,
        data: session,
      } as ApiResponse<SessionData>,
      { status: 201 }
    );
  } catch (error) {
    console.error("Sign-up error:", error);
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
