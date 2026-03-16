-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('local', 'google', 'ical');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('active', 'disconnected', 'error', 'reconnect_required');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('idle', 'syncing', 'success', 'error');

-- CreateEnum
CREATE TYPE "CalendarSourceSyncMode" AS ENUM ('local', 'imported', 'subscription');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('confirmed', 'tentative', 'cancelled');

-- CreateEnum
CREATE TYPE "CalendarAttendeeResponseStatus" AS ENUM ('needs_action', 'accepted', 'tentative', 'declined');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "scope" TEXT;

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'active',
    "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'idle',
    "providerConfig" JSONB NOT NULL DEFAULT '{}',
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "connectionId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "color" VARCHAR(16) NOT NULL DEFAULT '#2563EB',
    "timezone" VARCHAR(64),
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "syncMode" "CalendarSourceSyncMode" NOT NULL DEFAULT 'local',
    "externalCalendarId" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalEventId" VARCHAR(255),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(255),
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64),
    "recurrenceRule" TEXT,
    "recurrenceExDates" JSONB NOT NULL DEFAULT '[]',
    "recurrenceOverrides" JSONB NOT NULL DEFAULT '{}',
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'confirmed',
    "meetingUrl" VARCHAR(1024),
    "linkedContentId" UUID,
    "providerMetadata" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventAttendee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" "CalendarAttendeeResponseStatus" NOT NULL DEFAULT 'needs_action',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_userId_provider_idx" ON "CalendarConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "CalendarConnection_userId_status_idx" ON "CalendarConnection"("userId", "status");

-- CreateIndex
CREATE INDEX "CalendarSource_userId_visible_idx" ON "CalendarSource"("userId", "visible");

-- CreateIndex
CREATE INDEX "CalendarSource_connectionId_idx" ON "CalendarSource"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSource_userId_externalCalendarId_key" ON "CalendarSource"("userId", "externalCalendarId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_startAt_endAt_idx" ON "CalendarEvent"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_sourceId_startAt_idx" ON "CalendarEvent"("sourceId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_linkedContentId_idx" ON "CalendarEvent"("linkedContentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceId_externalEventId_key" ON "CalendarEvent"("sourceId", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventAttendee_eventId_email_key" ON "CalendarEventAttendee"("eventId", "email");

-- CreateIndex
CREATE INDEX "CalendarEventAttendee_eventId_responseStatus_idx" ON "CalendarEventAttendee"("eventId", "responseStatus");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_linkedContentId_fkey" FOREIGN KEY ("linkedContentId") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
