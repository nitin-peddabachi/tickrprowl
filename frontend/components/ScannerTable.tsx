"use client";

import { useState } from "react";
import StockModal from "@/components/StockModal";
import { useApi } from "@/lib/api";

interface Props {
  stocks: any[];
}

const signalConfig: Record<string, { classes: string; icon: string }> = {
  "Strong Buy":  { classes: "text-[var(--buy)] bg-[var(--amber-glow)]",      icon: "▲▲" },
  "Buy":         { classes: "text-[var(--buy)] bg-[var(--amber-glow)]",      icon: "▲"  },
  "Watch":       { classes: "text-[var(--warn)] bg-[var(--warn)]/10",        icon: "◎"  },
  "Neutral":     { classes: "text-[var(--paper-fade)] bg-[var(--paper-fade)]/10", icon: "─"  },
  "Sell":        { classes: "text-[var(--sell)] bg-[var(--sell)]/10",        icon: "▼"  },
  "Strong Sell": { classes: "text-[var(--sell)] bg-[var(--sell)]/10",        icon: "▼▼" },
};

const STEAL_CONDITION_LABELS: Record<string, string> = {
  rsi_oversold: "RSI < 30",
  strong_signal: "Score ≥ 70",
  cheap_valuation: "P/E < 15",
  growing_revenue: "Revenue Growing",
  low_leverage: "Low Leverage",
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

type SortKey = "oversold_score" | "rsi" | "pct_from_52w_high" | "pe_ratio" | "piotroski_score";

function exportToCsv(stocks: any[]) {
  const headers = ["Ticker", "Company", "Signal", "Score", "Price", "RSI", "From High %", "P/E", "F-Score", "Fwd P/E", "Rev Growth %", "Profit Margin %", "Sector", "Market Cap", "Absolute Steal"];
  const rows = stocks.map(s => [
    s.ticker,
    `"${s.company_name}"`,
    s.signal,
    s.oversold_score,
    s.current_price,
    s.technicals?.rsi?.toFixed(2) ?? "",
    s.pct_from_52w_high?.toFixed(2) ?? "",
    s.fundamentals?.pe_ratio?.toFixed(2) ?? "",
    s.piotroski?.score ?? "",
    s.fundamentals?.forward_pe?.toFixed(2) ?? "",
    s.fundamentals?.revenue_growth != null ? (s.fundamentals.revenue_growth * 100).toFixed(1) : "",
    s.fundamentals?.profit_margin != null ? (s.fundamentals.profit_margin * 100).toFixed(1) : "",
    `"${s.sector ?? ""}"`,
    s.market_cap ?? "",
    s.is_absolute_steal ? "Yes" : "No",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickrprowl-scan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type WatchlistStatus = "idle" | "loading" | "added" | "error";

export default function ScannerTable({ stocks }: Props) {
  const api = useApi();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("oversold_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [watchlistStatus, setWatchlistStatus] = useState<Record<string, WatchlistStatus>>({});

  const addToWatchlist = async (e: React.MouseEvent, stock: any) => {
    e.stopPropagation();
    const { ticker } = stock;
    setWatchlistStatus(prev => ({ ...prev, [ticker]: "loading" }));
    try {
      await api.post("/api/watchlist/", {
        ticker,
        company_name: stock.company_name,
        sector: stock.sector,
      });
      setWatchlistStatus(prev => ({ ...prev, [ticker]: "added" }));
    } catch (err: any) {
      if (err.response?.status === 400) {
        // Already in watchlist — treat as success
        setWatchlistStatus(prev => ({ ...prev, [ticker]: "added" }));
      } else {
        setWatchlistStatus(prev => ({ ...prev, [ticker]: "error" }));
        setTimeout(() => setWatchlistStatus(prev => ({ ...prev, [ticker]: "idle" })), 2000);
      }
    }
  };

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
    if (key === "rsi") return stock.technicals?.rsi ?? 0;
    if (key === "pct_from_52w_high") return stock.pct_from_52w_high ?? 0;
    if (key === "pe_ratio") return stock.fundamentals?.pe_ratio ?? 9999;
    if (key === "piotroski_score") return stock.piotroski?.score ?? -1;
    return 0;
  };

  const sectors = ["all", ...Array.from(new Set(stocks.map(s => s.sector).filter(Boolean))).sort()];

  const filtered = (
    filter === "all" ? stocks :
    filter === "Absolute Steal" ? stocks.filter(s => s.is_absolute_steal) :
    filter === "F≥7" ? stocks.filter(s => (s.piotroski?.score ?? -1) >= 7) :
    stocks.filter(s => s.signal === filter)
  ).filter(s => sectorFilter === "all" || s.sector === sectorFilter);

  const sorted = [...filtered].sort((a, b) => {
    const diff = getValue(a, sortKey) - getValue(b, sortKey);
    return sortDir === "desc" ? -diff : diff;
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider cursor-pointer hover:text-[var(--amber)] select-none"
      onClick={() => handleSort(col)}
    >
      {label} {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <>
    <div>
      {/* Sector filter + Export */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--paper-fade)] uppercase tracking-wider">Sector</span>
          <select
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            className="bg-[var(--ink-raised)] border border-[var(--ink-hairline)] text-[var(--paper-fade)] text-xs rounded-none px-3 py-1.5 focus:outline-none focus:border-[var(--amber)]"
          >
            {sectors.map(s => (
              <option key={s} value={s}>{s === "all" ? "All Sectors" : s}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => exportToCsv(sorted)}
          className="text-xs px-3 py-1.5 rounded-none border border-[var(--ink-hairline)] text-[var(--paper-fade)] hover:border-[var(--amber)] hover:text-[var(--amber)] transition-colors"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {["all", "Absolute Steal", "Strong Buy", "Buy", "F≥7", "Watch", "Neutral"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
              filter === f && f === "Absolute Steal"
                ? "bg-amber-400 text-gray-900"
                : filter === f && f === "F≥7"
                ? "bg-[var(--buy)] text-[var(--ink-bg)]"
                : filter === f
                ? "bg-[var(--amber)] text-[var(--ink-bg)]"
                : f === "Absolute Steal"
                ? "bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                : f === "F≥7"
                ? "text-[var(--buy)] bg-[var(--buy)]/10 hover:bg-[var(--buy)]/20"
                : "bg-[var(--ink-raised)] text-[var(--paper-fade)] hover:text-[var(--paper)]"
            }`}
          >
            {f === "all" ? "All" : f === "Absolute Steal" ? "🔥 Absolute Steal" : f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-none border border-[var(--ink-hairline)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ink-surface)] border-b border-[var(--ink-hairline)]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">#</th>
              <th className="px-3 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Stock</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Signal</th>
              <SortHeader label="Score" col="oversold_score" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Price</th>
              <SortHeader label="RSI" col="rsi" />
              <SortHeader label="From High" col="pct_from_52w_high" />
              <SortHeader label="P/E" col="pe_ratio" />
              <SortHeader label="F-Score" col="piotroski_score" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Rev Growth</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Mkt Cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ink-hairline)]">
            {sorted.map((stock, i) => (
              <tr
                key={stock.ticker}
                onClick={() => setSelectedTicker(stock.ticker)}
                className="bg-[var(--ink-bg)] hover:bg-[var(--ink-surface)] transition-colors cursor-pointer animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
              >
                <td className="px-4 py-3 text-[var(--paper-vapor)]">{i + 1}</td>
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                  {(() => {
                    const status = watchlistStatus[stock.ticker] ?? "idle";
                    return (
                      <button
                        onClick={e => addToWatchlist(e, stock)}
                        disabled={status === "loading" || status === "added"}
                        title={status === "added" ? "In watchlist" : "Add to watchlist"}
                        className={`w-7 h-7 rounded-none flex items-center justify-center text-sm font-bold transition-all ${
                          status === "added"
                            ? "bg-[var(--amber-glow)] text-[var(--buy)] cursor-default"
                            : status === "error"
                            ? "bg-[var(--sell)]/20 text-[var(--sell)]"
                            : status === "loading"
                            ? "bg-[var(--ink-raised)] text-[var(--paper-vapor)] cursor-wait"
                            : "bg-[var(--ink-raised)] text-[var(--paper-fade)] hover:bg-[var(--amber-glow)] hover:text-[var(--buy)]"
                        }`}
                      >
                        {status === "loading" ? "·" : status === "added" ? "✓" : status === "error" ? "!" : "+"}
                      </button>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <div className="font-bold text-[var(--paper)]">{stock.ticker}</div>
                  <div className="text-[var(--paper-fade)] text-xs truncate max-w-[150px]">{stock.company_name}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    {(() => {
                      const s = signalConfig[stock.signal] || signalConfig["Neutral"];
                      return (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-none flex items-center gap-1 w-fit ${s.classes}`}>
                          <span className="opacity-60 text-[10px]">{s.icon}</span>
                          {stock.signal}
                        </span>
                      );
                    })()}
                    {stock.is_absolute_steal && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-none bg-amber-400/15 text-amber-300 whitespace-nowrap">
                        🔥 Steal
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-[3px] bg-[var(--ink-raised)]">
                      <div
                        className="h-[3px] bg-[var(--amber)]"
                        style={{ width: `${stock.oversold_score}%` }}
                      />
                    </div>
                    <span className="text-[var(--paper)] font-medium">{stock.oversold_score}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[var(--paper)] font-mono">${fmt(stock.current_price)}</span>
                  {stock.price_change_pct != null && (
                    <span className={`block text-xs font-mono ${stock.price_change_pct >= 0 ? "text-[var(--buy-strong)]" : "text-[var(--sell-strong)]"}`}>
                      {stock.price_change_pct >= 0 ? "+" : ""}{fmt(stock.price_change_pct)}%
                    </span>
                  )}
                </td>
                <td className={`px-4 py-3 font-mono font-medium ${
                  (stock.technicals?.rsi ?? 50) < 30 ? "text-[var(--buy)]" :
                  (stock.technicals?.rsi ?? 50) > 70 ? "text-[var(--sell)]" : "text-[var(--paper)]"
                }`}>
                  {fmt(stock.technicals?.rsi)}
                </td>
                <td className={`px-4 py-3 font-mono font-medium ${stock.pct_from_52w_high < -20 ? "text-[var(--buy)]" : "text-[var(--paper)]"}`}>
                  {fmt(stock.pct_from_52w_high)}%
                </td>
                <td className="px-4 py-3 text-[var(--paper)] font-mono">{fmt(stock.fundamentals?.pe_ratio)}</td>
                <td className="px-4 py-3 font-mono font-medium">
                  {stock.piotroski?.score != null ? (
                    <span className={`text-xs px-1.5 py-0.5 border tabular ${
                      stock.piotroski.score >= 7 ? "border-[var(--buy)] text-[var(--buy)]" :
                      stock.piotroski.score <= 2 ? "border-[var(--sell)] text-[var(--sell)]" :
                      "border-[var(--amber)] text-[var(--amber)]"
                    }`}>
                      {stock.piotroski.score}/9
                    </span>
                  ) : <span className="text-[var(--paper-vapor)]">—</span>}
                </td>
                <td className={`px-4 py-3 font-mono font-medium ${
                  (stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"
                }`}>
                  {stock.fundamentals.revenue_growth !== null && stock.fundamentals.revenue_growth !== undefined
                    ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-[var(--paper-fade)] font-mono">{fmtMarketCap(stock.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

      <StockModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />
    </>
  );
}
