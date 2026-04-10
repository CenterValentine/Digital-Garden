import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { createPerson } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

interface CreatePersonRequest {
  displayName?: string;
  primaryGroupId?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  organization?: string | null;
  jobTitle?: string | null;
  birthday?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CreatePersonRequest;

    if (!body.displayName?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "displayName is required",
          },
        },
        { status: 400 }
      );
    }

    const person = await createPerson(prisma, {
      ownerId: session.user.id,
      displayName: body.displayName,
      primaryGroupId: body.primaryGroupId ?? null,
      givenName: body.givenName ?? null,
      familyName: body.familyName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      avatarUrl: body.avatarUrl ?? null,
      metadata: {
        organization: body.organization?.trim() || null,
        jobTitle: body.jobTitle?.trim() || null,
        birthday: body.birthday?.trim() || null,
        website: body.website?.trim() || null,
        address: {
          line1: body.addressLine1?.trim() || null,
          line2: body.addressLine2?.trim() || null,
          city: body.city?.trim() || null,
          region: body.region?.trim() || null,
          postalCode: body.postalCode?.trim() || null,
          country: body.country?.trim() || null,
        },
        notes: body.notes?.trim() || null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          treeNodeKind: "person",
          id: `person:${person.id}`,
          personId: person.id,
          primaryGroupId: person.primaryGroupId,
          label: person.displayName,
          slug: person.slug,
          email: person.email,
          phone: person.phone,
          avatarUrl: person.avatarUrl,
          mount: null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/people/persons error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create person",
        },
      },
      { status: 500 }
    );
  }
}
