"use client";

import { useState } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import PriceChart from "@/components/PriceChart";

interface Props {
  stock: any;
}

const signalColors: Record<string, string> = {
  "Strong Buy": "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  "Buy": "text-green-400 bg-green-400/10 border-green-400/30",
  "Watch": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  "Neutral": "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

function fmt(val: any, decimals = 2) {
  if (val === null || val === undefined) return "N/A";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

function fmtMarketCap(val: number | null) {
  if (!val) return "N/A";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  return `$${(val / 1e6).toFixed(2)}M`;
}

export default function StockCard({ stock }: Props) {
  const [watchlistStatus, setWatchlistStatus] = useState<"idle" | "adding" | "added" | "error">("idle");

  const addToWatchlist = async () => {
    setWatchlistStatus("adding");
    try {
      await axios.post("http://localhost:8000/api/watchlist/", { ticker: stock.ticker });
      setWatchlistStatus("added");
    } catch (e: any) {
      const msg = e.response?.data?.detail || "";
      setWatchlistStatus(msg.includes("already") ? "added" : "error");
    }
  };

  const revenueData = Object.entries(stock.quarterly_revenue_bn || {}).map(([date, val]) => ({
    quarter: date,
    revenue: val,
  })).reverse();

  const signalClass = signalColors[stock.signal] || signalColors["Neutral"];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{stock.ticker}</h2>
          <p className="text-gray-400 text-sm">{stock.company_name} · {stock.sector}</p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${signalClass}`}>
            {stock.signal}
          </span>
          <p className="text-2xl font-bold text-white">${fmt(stock.current_price)}</p>
          <p className="text-sm text-gray-500">{fmt(stock.pct_from_52w_high)}% from 52w high</p>
          <button
            onClick={addToWatchlist}
            disabled={watchlistStatus === "adding" || watchlistStatus === "added"}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              watchlistStatus === "added"
                ? "border-emerald-700 text-emerald-500 bg-emerald-500/10"
                : watchlistStatus === "error"
                ? "border-red-700 text-red-400"
                : "border-gray-700 text-gray-400 hover:border-emerald-500 hover:text-emerald-400"
            }`}
          >
            {watchlistStatus === "adding" ? "Adding..." :
             watchlistStatus === "added" ? "In Watchlist" :
             watchlistStatus === "error" ? "Error" :
             "+ Watchlist"}
          </button>
        </div>
      </div>

      {/* Absolute Steal Banner */}
      {stock.is_absolute_steal && (
        <div className="mb-5 rounded-xl border border-amber-400/40 bg-amber-400/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔥</span>
            <span className="text-amber-300 font-bold tracking-wide">ABSOLUTE STEAL</span>
            <span className="text-amber-500/70 text-xs">All conditions met</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stock.steal_conditions && Object.entries(stock.steal_conditions as Record<string, boolean>).map(([key, passed]) => {
              const labels: Record<string, string> = {
                rsi_oversold: "RSI < 30",
                strong_signal: "Score ≥ 70",
                cheap_valuation: "P/E < 15",
                growing_revenue: "Revenue Growing",
                low_leverage: "Low Leverage",
              };
              return (
                <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? "bg-amber-400/15 text-amber-300" : "bg-gray-800 text-gray-500"}`}>
                  {passed ? "✓" : "✗"} {labels[key] ?? key}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Overbought Warning */}
      {stock.is_overbought && (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">⚠️</span>
            <span className="text-red-300 font-bold tracking-wide">OVERBOUGHT</span>
            <span className="text-red-500/70 text-xs">Consider trimming</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stock.overbought_conditions && Object.entries(stock.overbought_conditions as Record<string, boolean>).map(([key, passed]) => {
              const labels: Record<string, string> = {
                rsi_high: "RSI > 70",
                near_upper_band: "Near Upper BB",
                far_from_low: ">25% Above 52w Low",
                high_valuation: "P/E > 35",
              };
              return (
                <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? "bg-red-400/15 text-red-300" : "bg-gray-800 text-gray-500"}`}>
                  {passed ? "✓" : "✗"} {labels[key] ?? key}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Earnings Warning */}
      {stock.next_earnings_date && (() => {
        const daysUntil = Math.ceil((new Date(stock.next_earnings_date).getTime() - Date.now()) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 14) {
          return (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm">
              <span>⚠️</span>
              <span className="text-yellow-300 font-medium">Earnings in {daysUntil} day{daysUntil !== 1 ? "s" : ""}</span>
              <span className="text-yellow-500/70">({stock.next_earnings_date}) — elevated volatility risk</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Oversold Score */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">Oversold Score</span>
          <span className="text-white font-semibold">{stock.oversold_score}/100</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${stock.oversold_score}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Technicals */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Technicals</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">RSI (14)</span>
              <span className={`font-medium ${stock.technicals.rsi < 30 ? "text-emerald-400" : stock.technicals.rsi > 70 ? "text-red-400" : "text-white"}`}>
                {fmt(stock.technicals.rsi)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MACD</span>
              <span className="text-white font-medium">{fmt(stock.technicals.macd, 4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">BB %</span>
              <span className="text-white font-medium">{fmt(stock.technicals.bb_percent, 3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">52w High</span>
              <span className="text-white font-medium">${fmt(stock.price_52w_high)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">52w Low</span>
              <span className="text-white font-medium">${fmt(stock.price_52w_low)}</span>
            </div>
          </div>
        </div>

        {/* Fundamentals */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Fundamentals</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">P/E Ratio</span>
              <span className={`font-medium ${stock.fundamentals.pe_ratio && stock.fundamentals.pe_ratio < 15 ? "text-emerald-400" : "text-white"}`}>{fmt(stock.fundamentals.pe_ratio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Forward P/E</span>
              <span className={`font-medium ${stock.fundamentals.forward_pe && stock.fundamentals.forward_pe < 15 ? "text-emerald-400" : "text-white"}`}>{fmt(stock.fundamentals.forward_pe)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">P/B Ratio</span>
              <span className="text-white font-medium">{fmt(stock.fundamentals.pb_ratio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Debt/Equity</span>
              <span className={`font-medium ${stock.fundamentals.debt_to_equity && stock.fundamentals.debt_to_equity > 200 ? "text-red-400" : "text-white"}`}>{fmt(stock.fundamentals.debt_to_equity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Revenue Growth</span>
              <span className={`font-medium ${(stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stock.fundamentals.revenue_growth !== null ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Earnings Growth</span>
              <span className={`font-medium ${(stock.fundamentals.earnings_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stock.fundamentals.earnings_growth != null ? `${(stock.fundamentals.earnings_growth * 100).toFixed(1)}%` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Profit Margin</span>
              <span className={`font-medium ${(stock.fundamentals.profit_margin ?? 0) > 0.1 ? "text-emerald-400" : "text-white"}`}>
                {stock.fundamentals.profit_margin != null ? `${(stock.fundamentals.profit_margin * 100).toFixed(1)}%` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Market Cap</span>
              <span className="text-white font-medium">{fmtMarketCap(stock.market_cap)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Price History Chart */}
      <PriceChart ticker={stock.ticker} />

      {/* Quarterly Revenue Chart */}
      {revenueData.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Quarterly Revenue (Bn)</h3>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={revenueData}>
              <XAxis dataKey="quarter" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px" }}
                labelStyle={{ color: "#9ca3af" }}
                formatter={(val: any) => [`$${val}B`, "Revenue"]}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
