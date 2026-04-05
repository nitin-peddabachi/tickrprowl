"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";

export default function Navbar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetchUnread = () => {
      axios
        .get("http://localhost:8000/api/alerts/notifications/unread-count")
        .then((res) => setUnread(res.data.count))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  const links = [
    { href: "/", label: "Search" },
    { href: "/scanner", label: "Scanner" },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/alerts", label: "Alerts" },
  ];

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
            Stock<span className="text-emerald-400">r</span>
          </span>
        </Link>

        {/* Links */}
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
                {/* Active underline */}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
