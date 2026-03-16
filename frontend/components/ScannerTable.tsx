"use client";

import { useState } from "react";

interface Props {
  stocks: any[];
}

const signalColors: Record<string, string> = {
  "Strong Buy": "text-emerald-400 bg-emerald-400/10",
  "Buy": "text-green-400 bg-green-400/10",
  "Watch": "text-yellow-400 bg-yellow-400/10",
  "Neutral": "text-gray-400 bg-gray-400/10",
};

function fmt(val: any, decimals = 2) {
  if (val === null || val === undefined) return "—";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

function fmtMarketCap(val: number | null) {
  if (!val) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  return `$${(val / 1e6).toFixed(1)}M`;
}

type SortKey = "oversold_score" | "rsi" | "pct_from_52w_high" | "pe_ratio";

export default function ScannerTable({ stocks }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("oversold_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<string>("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const getValue = (stock: any, key: SortKey) => {
    if (key === "oversold_score") return stock.oversold_score;
    if (key === "rsi") return stock.technicals.rsi;
    if (key === "pct_from_52w_high") return stock.pct_from_52w_high;
    if (key === "pe_ratio") return stock.fundamentals.pe_ratio ?? 9999;
    return 0;
  };

  const filtered = filter === "all" ? stocks : stocks.filter(s => s.signal === filter);
  const sorted = [...filtered].sort((a, b) => {
    const diff = getValue(a, sortKey) - getValue(b, sortKey);
    return sortDir === "desc" ? -diff : diff;
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-emerald-400 select-none"
      onClick={() => handleSort(col)}
    >
      {label} {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {["all", "Strong Buy", "Buy", "Watch", "Neutral"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-emerald-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Signal</th>
              <SortHeader label="Score" col="oversold_score" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Price</th>
              <SortHeader label="RSI" col="rsi" />
              <SortHeader label="From High" col="pct_from_52w_high" />
              <SortHeader label="P/E" col="pe_ratio" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Rev Growth</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Mkt Cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map((stock, i) => (
              <tr key={stock.ticker} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-bold text-white">{stock.ticker}</div>
                  <div className="text-gray-500 text-xs truncate max-w-[150px]">{stock.company_name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${signalColors[stock.signal]}`}>
                    {stock.signal}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${stock.oversold_score}%` }}
                      />
                    </div>
                    <span className="text-white font-medium">{stock.oversold_score}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-white">${fmt(stock.current_price)}</td>
                <td className={`px-4 py-3 font-medium ${
                  stock.technicals.rsi < 30 ? "text-emerald-400" :
                  stock.technicals.rsi > 70 ? "text-red-400" : "text-white"
                }`}>
                  {fmt(stock.technicals.rsi)}
                </td>
                <td className={`px-4 py-3 font-medium ${stock.pct_from_52w_high < -20 ? "text-emerald-400" : "text-white"}`}>
                  {fmt(stock.pct_from_52w_high)}%
                </td>
                <td className="px-4 py-3 text-white">{fmt(stock.fundamentals.pe_ratio)}</td>
                <td className={`px-4 py-3 font-medium ${
                  (stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"
                }`}>
                  {stock.fundamentals.revenue_growth !== null && stock.fundamentals.revenue_growth !== undefined
                    ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-gray-400">{fmtMarketCap(stock.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
