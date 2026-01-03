import Link from "next/link";
import Logo from "@/components/client/logo/Logo";
import { Button } from "@/components/client/ui/button/Button";

export default function Navigation() {
  return (
    <nav className="bg-card border-b border-border">
      <div className="flex flex-col items-center justify-center max-w-3xl mx-auto py-4">
        <Logo />
      </div>
      <div className="flex justify-center gap-2 pb-4">
        <Button variant="ghost" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/about">About</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/contact">Contact</Link>
        </Button>
      </div>
    </nav>
  );
}
