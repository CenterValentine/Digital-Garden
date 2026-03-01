import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has("session_token");
  redirect(hasSession ? "/content/" : "/sign-in");
}
