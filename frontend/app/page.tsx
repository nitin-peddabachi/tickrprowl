"use client";

import { useState } from "react";
import StockCard from "@/components/StockCard";
import SearchBar from "@/components/SearchBar";
import { publicApi } from "@/lib/api";

const QUICK_PICKS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMD", "GOOGL", "META", "JPM"];

export default function Home() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTicker, setLoadingTicker] = useState("");
  const [error, setError] = useState("");

  const analyzeStock = async (ticker: string) => {
    setLoading(true);
    setLoadingTicker(ticker.toUpperCase());
    setError("");
    try {
      const res = await publicApi.get(`/api/stocks/${ticker}`);
      setStocks((prev) => {
        const filtered = prev.filter((s) => s.ticker !== res.data.ticker);
        return [res.data, ...filtered];
      });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to fetch stock data.");
    } finally {
      setLoading(false);
      setLoadingTicker("");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--ink-bg)] text-[var(--paper)]">
      {/* ── Hero — editorial cover treatment ─────────────────────────── */}
      <section className="relative border-b border-[var(--ink-hairline)]">
        <div className="relative max-w-5xl mx-auto px-8 pt-20 pb-16">
          {/* Eyebrow — issue/date masthead-style */}
          <div className="eyebrow mb-8 flex items-center gap-3 max-w-2xl mx-auto">
            <span className="h-px flex-1 bg-[var(--ink-divider)]" />
            <span>Vol. 1 · Issue 1</span>
            <span className="text-[var(--paper-vapor)]">·</span>
            <span className="font-mono normal-case tracking-wide">An equity brief</span>
            <span className="h-px flex-1 bg-[var(--ink-divider)]" />
          </div>

          <h1 className="serif font-bold text-center text-[var(--paper)] tracking-tight leading-[0.95] text-[clamp(2.75rem,7vw,5rem)] mb-6">
            Find <span className="serif italic text-[var(--amber)] font-light">oversold</span> stocks
            <br />
            worth buying.
          </h1>

          <p className="text-center max-w-xl mx-auto text-[var(--paper-dim)] text-base leading-relaxed mb-12">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--paper-fade)] block mb-2">An analyst's toolkit</span>
            RSI, Bollinger Bands, DCF, Piotroski F-Score, and analyst consensus —
            composed into one editorial brief.
          </p>

          <div className="relative z-20 max-w-2xl mx-auto">
            <SearchBar onSearch={analyzeStock} loading={loading} />

            {/* Quick picks — mono chips with hairline borders */}
            {stocks.length === 0 && (
              <div className="mt-6 flex items-center gap-3 flex-wrap justify-center">
                <span className="eyebrow">Specimens</span>
                <span className="text-[var(--paper-vapor)]">·</span>
                {QUICK_PICKS.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => analyzeStock(t)}
                    disabled={loading}
                    className="font-mono text-[11px] tabular tracking-tight px-2.5 py-1 border border-[var(--ink-hairline)] text-[var(--paper-fade)] hover:border-[var(--amber)] hover:text-[var(--amber)] hover:bg-[var(--amber-glow)] transition-all disabled:opacity-30"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="mt-6 text-center text-[var(--sell)] text-sm font-mono">
              <span className="eyebrow text-[var(--sell)] mr-2">Error</span>
              {error}
            </p>
          )}
        </div>
      </section>

      {/* ── Results ───────────────────────────────────────────────────── */}
      <section className="relative z-0 max-w-5xl mx-auto px-8 py-12">
        {/* Loading skeleton — matches new card aesthetic */}
        {loading && (
          <div className="animate-pulse relative bg-[var(--ink-surface)] border border-[var(--ink-hairline)] p-8 mb-6">
            <span aria-hidden className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[var(--amber-dim)]" />
            <span aria-hidden className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[var(--amber-dim)]" />
            <span aria-hidden className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[var(--amber-dim)]" />
            <span aria-hidden className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[var(--amber-dim)]" />
            <div className="eyebrow mb-6">Setting type for {loadingTicker}</div>
            <div className="flex justify-between mb-8">
              <div>
                <div className="h-12 w-32 bg-[var(--ink-divider)] mb-3" />
                <div className="h-3 w-40 bg-[var(--ink-divider)]" />
              </div>
              <div className="text-right">
                <div className="h-10 w-32 bg-[var(--ink-divider)] mb-2 ml-auto" />
                <div className="h-3 w-20 bg-[var(--ink-divider)] ml-auto" />
              </div>
            </div>
            <div className="h-20 w-40 bg-[var(--ink-divider)] mb-6" />
            <div className="grid grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="h-2 w-16 bg-[var(--ink-divider)] mb-2" />
                  <div className="h-px bg-[var(--ink-divider)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8">
          {stocks.map((stock, i) => (
            <div key={stock.ticker} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <StockCard stock={stock} />
            </div>
          ))}
        </div>

        {/* Empty state — editorial, italic Fraunces */}
        {stocks.length === 0 && !loading && (
          <div className="mt-20 text-center">
            <p className="serif italic text-2xl text-[var(--paper-fade)] mb-3">
              The press is ready.
            </p>
            <p className="text-sm text-[var(--paper-vapor)] font-mono uppercase tracking-[0.18em]">
              Set a ticker to begin
            </p>
          </div>
        )}
      </section>

      {/* ── Footer colophon ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--ink-hairline)] py-6">
        <div className="max-w-5xl mx-auto px-8 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--paper-vapor)]">
          <span>Tickrprowl · {new Date().getFullYear()}</span>
          <span>Set in Fraunces &amp; IBM Plex</span>
        </div>
      </footer>
    </main>
  );
}
