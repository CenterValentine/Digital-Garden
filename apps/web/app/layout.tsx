import type { Metadata } from "next";
import React from "react";
import "./globals.css";
import Head from "@/components/server/layout/head";
import NavBar from "@/components/client/nav/NavBar";
import type { NavItem } from "@/components/client/nav/NavBar";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create Next App",
  description:
    "Generate https://www.youtube.com/watch?v=-g1yKRo5XtYd by create next app",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Define all navigation items
  const allNavItems: NavItem[] = [
    { href: "/", label: "Home", position: "left", allowedRoles: ["all"] },
    {
      href: "/about",
      label: "About",
      position: "right",
      allowedRoles: ["all"],
    },
    {
      href: "/resume",
      label: "Resume",
      position: "left",
      allowedRoles: ["all"],
    },
    {
      href: "/contact",
      label: "Contact",
      position: "right",
      allowedRoles: ["all"],
    },
    {
      href: "/admin",
      label: "Admin",
      position: "right",
      allowedRoles: ["owner", "admin"],
    },
    {
      href: "/builder",
      label: "Builder",
      position: "right",
      allowedRoles: ["owner", "admin"],
    },
  ];

  // Get session server-side for security filtering
  const session = await getSession();

  // Filter nav items server-side based on user role
  // This prevents sensitive route information from being exposed in client bundle
  const filteredNavItems = allNavItems.filter((item) => {
    // If allowedRoles is undefined or includes "all", item is visible to everyone
    if (!item.allowedRoles || item.allowedRoles.includes("all")) {
      return true;
    }

    // For unauthenticated users, only show items with "all" or undefined
    if (!session?.user) {
      return false;
    }

    // For authenticated users, check if their role is in allowedRoles
    return item.allowedRoles.includes(session.user.role);
  });

  // Auth configuration
  const authConfig = {
    signInUrl: "/sign-in",
    signOutUrl: "/api/auth/sign-out",
  };

  return (
    <html lang="en">
      <Head></Head>
      <body className="min-h-screen w-full relative">
        <NavBar navItems={filteredNavItems} authConfig={authConfig} />
        <main className="pt-20">{children}</main>
      </body>
    </html>
  );
}
