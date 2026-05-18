import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/infrastructure/auth/password";
import { createSession } from "@/lib/infrastructure/auth/session";
import {
  isValidEmail,
  type ApiResponse,
  type SignInInput,
  type SessionData,
} from "@/lib/infrastructure/auth/types";

import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/auth/sign-in";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const body: unknown = await request.json();

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

      // Email and password are deliberately NOT logged.
      const session = await withSpan(
        { layer: "auth", name: "sign_in" },
        { summary: "password sign-in" },
        async (span) => {
          const user = await prisma.user.findUnique({
            where: { email: input.email },
          });

          if (!user || !user.passwordHash) {
            span.attr("ok", false).summary("user not found");
            return { failed: true as const };
          }

          const isValid = await verifyPassword(input.password, user.passwordHash);
          if (!isValid) {
            span.attr("ok", false).summary("password mismatch");
            return { failed: true as const };
          }

          const sess = await createSession(user.id);
          span.attr("ok", true).summary("session created");
          return { failed: false as const, session: sess };
        },
      );

      if (session.failed) {
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

      return NextResponse.json(
        {
          success: true,
          data: session.session,
        } as ApiResponse<SessionData>,
        { status: 200 }
      );
    } catch (error) {
      logger.error({
        layer: "auth",
        event: "sign_in:caught",
        summary: "sign-in failed — 500",
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
