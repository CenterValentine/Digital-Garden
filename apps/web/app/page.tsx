import AppNav from "@/components/client/app-nav/app-nav";
import { getCurrentUser } from "@/lib/auth/middleware";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="w-full h-[calc(100vh-80px)] fixed top-20 left-0 right-0 bg-gradient-to-br from-teal-dark via-teal-mid to-teal-dark overflow-hidden">
      {/* <Tree /> */}
      <AppNav />
      {user && (
        <div className="absolute top-4 right-4 p-4 bg-card text-card-foreground rounded-lg shadow-md border border-border">
          <p className="text-sm text-foreground">Welcome, {user.username}!</p>
          <p className="text-xs text-muted-foreground">Role: {user.role}</p>
        </div>
      )}
    </div>
  );
}
