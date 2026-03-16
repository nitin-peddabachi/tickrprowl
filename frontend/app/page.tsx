"use client";

import { useState } from "react";
import axios from "axios";
import StockCard from "@/components/StockCard";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyzeStock = async (ticker: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`http://localhost:8000/api/stocks/${ticker}`);
      setStocks((prev) => {
        const filtered = prev.filter((s) => s.ticker !== res.data.ticker);
        return [res.data, ...filtered];
      });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to fetch stock data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-emerald-400 mb-1">Stockr</h1>
          <p className="text-gray-400">Identify oversold stocks with strong fundamentals</p>
        </div>

        <SearchBar onSearch={analyzeStock} loading={loading} />

        {error && (
          <p className="mt-4 text-red-400 text-sm">{error}</p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6">
          {stocks.map((stock) => (
            <StockCard key={stock.ticker} stock={stock} />
          ))}
        </div>

        {stocks.length === 0 && !loading && (
          <div className="mt-20 text-center text-gray-600">
            <p className="text-lg">Search for a stock ticker to get started</p>
            <p className="text-sm mt-2">e.g. AAPL, MSFT, TSLA, NVDA</p>
          </div>
        )}
      </div>
    </main>
  );
}
