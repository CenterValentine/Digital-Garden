/**
 * STUB — unified inbox (notifications, DMs, connections).
 *
 * Scope:
 *   - Bell icon renders in NotesNavBar with unread badge count
 *   - Bell popover: All/Unread tabs, Today/Earlier grouping, mark-all-read
 *   - Inline Accept/Decline on connection.invite notifications
 *   - /inbox page: Notifications / Messages / Connections tabs, ?tab= deep links
 *   - DM thread view: send message, optimistic render, live delta poll
 *   - Connections panel: invite form (enumeration-safe toast), revoke, block
 *   - Settings /settings/notifications: per-kind toggles persist
 *
 * Blocked on:
 *   - Auth fixture (tests/e2e/_fixtures/auth.ts) — all inbox surfaces
 *     require a signed-in session
 *   - Two-user seed fixture for connection/DM round-trips
 */

import { test } from "@playwright/test";

test.describe("inbox: notifications", () => {
  test.skip("bell renders with unread badge after seeded notification", async ({ page }) => {
    void page;
  });

  test.skip("popover shows All/Unread tabs with Today/Earlier grouping", async ({ page }) => {
    void page;
  });

  test.skip("mark-all-read clears the badge optimistically", async ({ page }) => {
    void page;
  });

  test.skip("invite notification exposes inline Accept/Decline", async ({ page }) => {
    void page;
  });
});

test.describe("inbox: full page", () => {
  test.skip("?tab=messages&thread= deep link opens the thread", async ({ page }) => {
    void page;
  });

  test.skip("sending a DM renders optimistically then reconciles", async ({ page }) => {
    void page;
  });

  test.skip("connections tab lists invites sent/received with actions", async ({ page }) => {
    void page;
  });

  test.skip("invite form always reports success (enumeration safety)", async ({ page }) => {
    void page;
  });
});

test.describe("inbox: settings", () => {
  test.skip("per-kind toggle persists and suppresses new projections", async ({ page }) => {
    void page;
  });
});
