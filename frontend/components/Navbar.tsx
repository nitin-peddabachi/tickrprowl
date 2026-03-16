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
    const interval = setInterval(fetchUnread, 60000); // poll every minute
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
    <nav className="bg-gray-900 border-b border-gray-800 px-8 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <span className="text-emerald-400 font-bold text-xl">Stockr</span>
        <div className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors relative ${
                pathname === link.href
                  ? "text-emerald-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {link.label}
              {link.href === "/alerts" && unread > 0 && (
                <span className="absolute -top-2 -right-3 bg-emerald-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
