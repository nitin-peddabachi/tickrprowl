"use client";

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
        <div className="text-right">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${signalClass}`}>
            {stock.signal}
          </span>
          <p className="text-2xl font-bold text-white mt-2">${fmt(stock.current_price)}</p>
          <p className="text-sm text-gray-500">{fmt(stock.pct_from_52w_high)}% from 52w high</p>
        </div>
      </div>

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
              <span className="text-white font-medium">{fmt(stock.fundamentals.pe_ratio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Forward P/E</span>
              <span className="text-white font-medium">{fmt(stock.fundamentals.forward_pe)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">P/B Ratio</span>
              <span className="text-white font-medium">{fmt(stock.fundamentals.pb_ratio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Debt/Equity</span>
              <span className="text-white font-medium">{fmt(stock.fundamentals.debt_to_equity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Revenue Growth</span>
              <span className={`font-medium ${(stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stock.fundamentals.revenue_growth !== null ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%` : "N/A"}
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
