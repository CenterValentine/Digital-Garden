import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/infrastructure/auth/password";
import { createSession } from "@/lib/infrastructure/auth/session";
import {
  extractUsername,
  isValidEmail,
  isValidPassword,
  type ApiResponse,
  type SignUpInput,
  type SessionData,
} from "@/lib/infrastructure/auth/types";

import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/auth/sign-up";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const body: unknown = await request.json();

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

      if (!isValidEmail(input.email)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_EMAIL", message: "Invalid email address" },
          } as ApiResponse<never>,
          { status: 400 }
        );
      }

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

      // Email and password are NOT logged in attrs.
      const result = await withSpan(
        { layer: "auth", name: "sign_up" },
        { summary: "register + create session" },
        async (span) => {
          const existingUser = await prisma.user.findUnique({
            where: { email: input.email },
          });

          if (existingUser) {
            span.attr("exists", true).summary("user already exists");
            return { exists: true as const };
          }

          let username = extractUsername(input.email);

          const existingUsername = await prisma.user.findUnique({
            where: { username },
          });

          if (existingUsername) {
            let counter = 1;
            let uniqueUsername = `${username}${counter}`;
            while (
              await prisma.user.findUnique({ where: { username: uniqueUsername } })
            ) {
              counter++;
              uniqueUsername = `${username}${counter}`;
            }
            username = uniqueUsername.substring(0, 50);
          }

          const passwordHash = await hashPassword(input.password);

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

          const session = await createSession(user.id);
          span.attr("created", true).summary("user + session created");
          return { exists: false as const, session };
        },
      );

      if (result.exists) {
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

      return NextResponse.json(
        {
          success: true,
          data: result.session,
        } as ApiResponse<SessionData>,
        { status: 201 }
      );
    } catch (error) {
      logger.error({
        layer: "auth",
        event: "sign_up:caught",
        summary: "sign-up failed — 500",
        error,
      });
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
  });
}
