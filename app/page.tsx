import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has("session_token");

  // Authenticated users go straight to the app
  if (hasSession) {
    redirect("/content/");
  }

  // Unauthenticated visitors see the home page rather than being forced to sign in
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">
        Digital Garden
      </h1>
      <p className="max-w-md text-base text-gray-400">
        A personal knowledge space for notes, ideas, and connected thinking.
      </p>
      <div className="flex gap-3">
        <a
          href="/sign-in"
          className="rounded-lg bg-gold-primary/20 px-5 py-2.5 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/30"
        >
          Sign in
        </a>
        <a
          href="/sign-up"
          className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5"
        >
          Create account
        </a>
      </div>
    </main>
  );
}
