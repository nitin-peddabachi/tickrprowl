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
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-8 pt-16 pb-10">
          <div className="mb-8 text-center">
            <h1 className="text-5xl font-extrabold mb-3 tracking-tight">
              <span className="text-white">Find </span>
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                oversold stocks
              </span>
              <span className="text-white"> worth buying</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              RSI, Bollinger Bands, DCF, Piotroski F-Score, and analyst consensus — all in one place.
            </p>
          </div>

          <div className="relative z-20 max-w-2xl mx-auto">
            <SearchBar onSearch={analyzeStock} loading={loading} />

            {/* Quick picks */}
            {stocks.length === 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
                <span className="text-xs text-gray-600 uppercase tracking-wider">Try:</span>
                {QUICK_PICKS.map((t) => (
                  <button
                    key={t}
                    onClick={() => analyzeStock(t)}
                    disabled={loading}
                    className="text-xs px-3 py-1 rounded-full border border-gray-700 text-gray-400 hover:border-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all disabled:opacity-40"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="mt-4 text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>

      {/* Results */}
      <div className="relative z-0 max-w-6xl mx-auto px-8 pb-16">
        {/* Loading skeleton */}
        {loading && (
          <div className="animate-pulse bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <div className="flex justify-between mb-6">
              <div>
                <div className="h-7 w-16 bg-gray-800 rounded mb-2" />
                <div className="h-4 w-40 bg-gray-800 rounded" />
              </div>
              <div className="text-right">
                <div className="h-6 w-24 bg-gray-800 rounded mb-2 ml-auto" />
                <div className="h-8 w-20 bg-gray-800 rounded ml-auto" />
              </div>
            </div>
            <div className="h-2 bg-gray-800 rounded-full mb-6" />
            <div className="grid grid-cols-2 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-800 rounded" />
              ))}
            </div>
            <p className="text-center text-gray-600 text-sm mt-4">Analyzing {loadingTicker}…</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {stocks.map((stock, i) => (
            <div key={stock.ticker} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
              <StockCard stock={stock} />
            </div>
          ))}
        </div>

        {stocks.length === 0 && !loading && (
          <div className="mt-16 text-center text-gray-700">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-600">Search a stock to get started</p>
            <p className="text-sm mt-1 text-gray-700">Try AAPL, NVDA, or any ticker above</p>
          </div>
        )}
      </div>
    </main>
  );
}
