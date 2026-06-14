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
    // User is actively viewing notifications — clear badge immediately
    if (pathname === "/alerts") {
      setUnread(0);
      return;
    }
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
  }, [isSignedIn, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const links = [
    { href: "/",          label: "Search"    },
    { href: "/scanner",   label: "Scanner"   },
    { href: "/watchlist", label: "Watchlist" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/alerts",    label: "Alerts"    },
  ];

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  return (
    <nav className="relative bg-[var(--ink-bg)] border-b border-[var(--ink-hairline)] sticky top-0 z-50">
      {/* Thin amber accent rule under the masthead */}
      <span aria-hidden className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--amber-dim)]/40 to-transparent" />

      <div className="max-w-6xl mx-auto px-8 flex items-center justify-between">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 py-5 group">
          {/* Claw mark icon — amber to match palette */}
          <svg width="18" height="16" viewBox="0 0 180 150" fill="none" aria-hidden="true" className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" style={{ marginBottom: 1 }}>
            <line x1="28" y1="132" x2="46"  y2="58"  stroke="#d4a574" strokeWidth="22" strokeLinecap="round"/>
            <line x1="80" y1="132" x2="98"  y2="34"  stroke="#d4a574" strokeWidth="22" strokeLinecap="round"/>
            <line x1="132" y1="132" x2="150" y2="10" stroke="#d4a574" strokeWidth="22" strokeLinecap="round"/>
            <line x1="150" y1="10"  x2="176" y2="3"  stroke="#f5c896" strokeWidth="10" strokeLinecap="round"/>
          </svg>
          <span className="serif font-bold text-[var(--paper)] text-2xl tracking-tight leading-none group-hover:text-[var(--amber)] transition-colors">
            Tickr<span className="serif-italic text-[var(--amber)]">prowl</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {/* ── Nav links — small caps, hairline underscore on active ── */}
          <div className="flex items-center">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                    active
                      ? "text-[var(--amber)]"
                      : "text-[var(--paper-fade)] hover:text-[var(--paper-dim)]"
                  }`}
                >
                  {link.label}
                  {link.href === "/alerts" && unread > 0 && (
                    <span className="absolute top-3 -right-0.5 bg-[var(--amber)] text-[var(--ink-bg)] text-[9px] font-mono font-bold w-4 h-4 flex items-center justify-center leading-none tabular">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                  {active && (
                    <span className="absolute bottom-3 left-3 right-3 h-px bg-[var(--amber)]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* ── Auth ─────────────────────────────────────────────── */}
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-[11px] uppercase tracking-[0.18em] px-4 py-1.5 border border-[var(--amber)] text-[var(--amber)] hover:bg-[var(--amber)] hover:text-[var(--ink-bg)] font-semibold transition-colors">
                Sign in
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </nav>
  );
}
