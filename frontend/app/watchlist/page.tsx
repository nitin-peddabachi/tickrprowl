"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import WatchlistCard from "@/components/WatchlistCard";

export default function WatchlistPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchWatchlist = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:8000/api/watchlist/");
      setItems(res.data);
    } catch {
      setError("Failed to load watchlist. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const removeStock = async (ticker: string) => {
    await axios.delete(`http://localhost:8000/api/watchlist/${ticker}`);
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const strongBuys = items.filter((i) => i.analysis?.signal === "Strong Buy").length;
  const buys = items.filter((i) => i.analysis?.signal === "Buy").length;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-emerald-400 mb-1">Watchlist</h1>
          <p className="text-gray-400">Your saved stocks with live analysis</p>
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
