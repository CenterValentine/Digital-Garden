import AppNav from "@/components/client/app-nav/app-nav";
import { getCurrentUser } from "@/lib/auth/middleware";
import { getNavigationTreeData } from "@/components/server/nav/NavigationData.server";

interface HomeProps {
  searchParams: { view?: string };
}

export default async function Home({ searchParams }: HomeProps) {
  const user = await getCurrentUser();
  const navigationData = await getNavigationTreeData(searchParams.view);

  return (
    <div className="w-full h-[calc(100vh-80px)] fixed top-20 left-0 right-0 bg-gradient-to-br from-shale-dark via-shale-mid to-shale-dark overflow-hidden">
      {/* <Tree /> */}
      <AppNav navigationData={navigationData} />
      {user && (
        <div className="absolute top-4 right-4 p-4 bg-card text-card-foreground rounded-lg shadow-md border border-border">
          <p className="text-sm text-foreground">Welcome, {user.username}!</p>
          <p className="text-xs text-muted-foreground">Role: {user.role}</p>
        </div>
      )}
    </div>
  );
}
