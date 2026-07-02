import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 422 });
  }

  // TODO: persist to an InviteRequest Prisma model once the schema migration
  // is applied. For now, log so the invite page works end-to-end immediately.
  console.info("[invite-request]", email);

  return NextResponse.json({ ok: true }, { status: 200 });
}
