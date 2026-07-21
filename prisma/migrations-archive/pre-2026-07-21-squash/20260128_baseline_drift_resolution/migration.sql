-- Baseline Migration: Resolve Drift
-- This migration captures schema changes that were applied directly to the database
-- without corresponding migration files. This establishes a clean baseline for future migrations.

-- AuditLog table already exists in database (added via db push)
-- User.settings and User.settingsVersion already exist
-- ContentTag.positions already exists
-- Various indexes and foreign keys already exist

-- This migration is marked as applied without running to establish baseline
-- See: docs/notes-feature/PRISMA-MIGRATION-GUIDE.md for drift resolution strategy

-- No changes needed - this is a baseline marker only
