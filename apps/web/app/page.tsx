import AppNav from "@/components/client/app-nav/app-nav";
import { getCurrentUser } from "@/lib/auth/middleware";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div
      className="w-full h-screen fixed inset-0"
      style={{ paddingTop: "64px" }}
    >
      {/* <Tree /> */}
      <AppNav />
      {user && (
        <div className="absolute top-20 right-4 p-4 bg-white rounded-lg shadow-md">
          <p className="text-sm text-gray-600">Welcome, {user.username}!</p>
          <p className="text-xs text-gray-500">Role: {user.role}</p>
        </div>
      )}
    </div>
  );
}
