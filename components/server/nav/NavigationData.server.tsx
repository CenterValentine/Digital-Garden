// Server component to fetch navigation data

// This server component enables dynamic navigation based on the user's role or viewKey
import { getNavigationData } from "@/lib/db/navigation";
import { getSession } from "@/lib/infrastructure/auth/session";

export async function getNavigationTreeData(viewKey?: string) {
  const session = await getSession();

  // If viewKey is provided, allow filtering even for unauthenticated users (guests)
  // This enables public curated views like ?view=portfolio
  if (!session?.user) {
    if (viewKey) {
      // Allow viewKey filtering for guests
      return getNavigationData({
        userId: "anonymous", // Placeholder for guest queries
        userRole: "guest",
        viewKey,
        includeUnpublished: false,
      });
    }
    // No session and no viewKey: return empty tree
    return {
      categories: [],
      standaloneDocuments: [],
    };
  }

  // Authenticated user: full navigation with optional viewKey filtering
  return getNavigationData({
    userId: session.user.id,
    userRole: session.user.role,
    viewKey,
    includeUnpublished:
      session.user.role === "owner" || session.user.role === "admin",
  });
}
