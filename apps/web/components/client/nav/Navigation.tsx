import Link from "next/link";
import Logo from "@/components/client/logo/Logo";

export default function Navigation() {
  return (
    <nav>
      <div className="flex flex-col items-center justify-center max-w-3xl mx-auto">
        <Logo />
      </div>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/contact">Contact</Link>
    </nav>
  );
}
