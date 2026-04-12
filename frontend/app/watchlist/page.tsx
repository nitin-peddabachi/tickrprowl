"use client";

import { useEffect, useState } from "react";
import WatchlistCard from "@/components/WatchlistCard";
import { useApi } from "@/lib/api";

function exportWatchlistCsv(items: any[]) {
  const headers = ["Ticker", "Company", "Sector", "Signal", "Score", "Price", "RSI", "P/E", "Rev Growth %", "Target Price", "Notes", "Added"];
  const rows = items.map(i => {
    const a = i.analysis;
    return [
      i.ticker,
      `"${i.company_name ?? ""}"`,
      `"${i.sector ?? ""}"`,
      a?.signal ?? "",
      a?.oversold_score ?? "",
      a?.current_price ?? "",
      a?.technicals?.rsi?.toFixed(2) ?? "",
      a?.fundamentals?.pe_ratio?.toFixed(2) ?? "",
      a?.fundamentals?.revenue_growth != null ? (a.fundamentals.revenue_growth * 100).toFixed(1) : "",
      i.target_price ?? "",
      `"${(i.notes ?? "").replace(/"/g, "'")}"`,
      i.added_at?.slice(0, 10) ?? "",
    ];
  });
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickrprowl-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WatchlistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const api = useApi();

  const fetchWatchlist = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/watchlist/");
      setItems(res.data);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load watchlist. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const removeStock = async (ticker: string) => {
    await api.delete(`/api/watchlist/${ticker}`);
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const strongBuys = items.filter((i) => i.analysis?.signal === "Strong Buy").length;
  const buys = items.filter((i) => i.analysis?.signal === "Buy").length;
  const steals = items.filter((i) => i.analysis?.is_absolute_steal).length;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-emerald-400 mb-1">Watchlist</h1>
            <p className="text-gray-400">Your saved stocks with live analysis</p>
          </div>
          <div className="flex flex-col items-end gap-2 mt-2">
            <div className="flex gap-2">
              <button
                onClick={fetchWatchlist}
                disabled={loading}
                className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-40"
              >
                {loading ? "Refreshing…" : "↺ Refresh"}
              </button>
              {items.length > 0 && (
                <button
                  onClick={() => exportWatchlistCsv(items)}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  ↓ Export CSV
                </button>
              )}
            </div>
            {lastUpdated && (
              <p className="text-xs text-gray-600">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {!loading && items.length > 0 && (
          <div className="flex gap-6 mb-8 text-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <p className="text-gray-500">Total</p>
              <p className="text-2xl font-bold text-white">{items.length}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <p className="text-gray-500">Strong Buy</p>
              <p className="text-2xl font-bold text-emerald-400">{strongBuys}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <p className="text-gray-500">Buy</p>
              <p className="text-2xl font-bold text-green-400">{buys}</p>
            </div>
            {steals > 0 && (
              <div className="bg-amber-400/5 border border-amber-400/30 rounded-lg px-4 py-3">
                <p className="text-amber-500/80">Absolute Steal</p>
                <p className="text-2xl font-bold text-amber-300">🔥 {steals}</p>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-gray-400 mt-20 justify-center">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading watchlist...
          </div>
        )}

        {error && <p className="text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <WatchlistCard key={item.ticker} item={item} onRemove={removeStock} />
          ))}
        </div>

        {!loading && items.length === 0 && !error && (
          <div className="mt-20 text-center text-gray-600">
            <p className="text-lg">Your watchlist is empty</p>
            <p className="text-sm mt-2">Search for a stock and click "Add to Watchlist"</p>
          </div>
        )}
      </div>
    </main>
  );
}
