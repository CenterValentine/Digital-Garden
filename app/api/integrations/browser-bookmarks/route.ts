import { NextResponse } from "next/server";
import { getBrowserBookmarksCapability } from "@/lib/domain/browser-bookmarks";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: getBrowserBookmarksCapability(),
  });
}
