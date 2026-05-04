"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { UserButton, SignInButton, Show, useAuth } from "@clerk/nextjs";
import { API_URL } from "@/lib/api";

export default function Navbar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    const fetchUnread = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/alerts/notifications/unread-count`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setUnread(data.count);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const links = [
    { href: "/", label: "Search" },
    { href: "/scanner", label: "Scanner" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/alerts", label: "Alerts" },
  ];

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  return (
    <nav className="bg-gray-900/80 backdrop-blur-md border-b border-gray-800 px-8 py-0 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 py-4">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <polyline points="1,10 4,6 7,8 10,3 13,5" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            Tickr<span className="text-emerald-400">Prowl</span>
          </span>
          <span className="text-gray-600 text-xs font-mono">v1.1.0</span>
        </Link>

        <div className="flex items-center gap-4">
          {/* Nav links */}
          <div className="flex items-center">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-4 text-sm font-medium transition-colors ${
                    active ? "text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {link.label}
                  {link.href === "/alerts" && unread > 0 && (
                    <span className="absolute top-2.5 right-1 bg-emerald-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-emerald-400" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Auth */}
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors">
                Sign in
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </nav>
  );
}
