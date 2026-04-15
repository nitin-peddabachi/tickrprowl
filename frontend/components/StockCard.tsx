"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "@/lib/api";
import PriceChart from "@/components/PriceChart";
import ScoreHistoryChart from "@/components/ScoreHistoryChart";

interface Props {
  stock: any;
}

const signalConfig: Record<string, { classes: string; icon: string }> = {
  "Strong Buy":  { classes: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", icon: "▲▲" },
  "Buy":         { classes: "text-green-400 bg-green-400/10 border-green-400/30",       icon: "▲"  },
  "Watch":       { classes: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",    icon: "◎"  },
  "Neutral":     { classes: "text-gray-400 bg-gray-400/10 border-gray-400/30",          icon: "─"  },
  "Sell":        { classes: "text-orange-400 bg-orange-400/10 border-orange-400/30",    icon: "▼"  },
  "Strong Sell": { classes: "text-red-400 bg-red-400/10 border-red-400/30",             icon: "▼▼" },
};

const reasonColor: Record<string, string> = {
  "Strong Buy": "text-emerald-400", "Buy": "text-green-400", "Watch": "text-yellow-400",
  "Sell": "text-orange-400", "Strong Sell": "text-red-400", "Neutral": "text-gray-500",
};

function num(val: any, decimals = 2) {
  if (val === null || val === undefined) return "N/A";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

function fmtMarketCap(val: number | null) {
  if (!val) return "N/A";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`;
  return `$${(val / 1e6).toFixed(2)}M`;
}

function fmtPct(val: number | null | undefined) {
  if (val === null || val === undefined) return "N/A";
  return `${(val * 100).toFixed(1)}%`;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{
          width: `${score}%`,
          background: "linear-gradient(to right, #ef4444, #f97316, #f59e0b, #84cc16, #10b981)",
          backgroundSize: "500px 100%",
        }}
      />
    </div>
  );
}

function MetricRow({ label, value, color = "text-white" }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-800/50 last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-mono text-xs font-medium ${color}`}>{value}</span>
    </div>
  );
}

function AnalystLabel({ rating }: { rating: number }) {
  if (rating <= 1.5) return <span className="text-emerald-400 font-semibold">Strong Buy</span>;
  if (rating <= 2.5) return <span className="text-green-400 font-semibold">Buy</span>;
  if (rating <= 3.5) return <span className="text-yellow-400 font-semibold">Hold</span>;
  if (rating <= 4.5) return <span className="text-orange-400 font-semibold">Underperform</span>;
  return <span className="text-red-400 font-semibold">Sell</span>;
}

type Tab = "technicals" | "fundamentals" | "analysis" | "insider";

export default function StockCard({ stock }: Props) {
  const [watchlistStatus, setWatchlistStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [activeTab, setActiveTab] = useState<Tab>("technicals");
  const api = useApi();

  const addToWatchlist = async () => {
    setWatchlistStatus("adding");
    try {
      await api.post("/api/watchlist/", { ticker: stock.ticker });
      setWatchlistStatus("added");
    } catch (e: any) {
      const msg = e.response?.data?.detail || "";
      setWatchlistStatus(msg.includes("already") ? "added" : "error");
    }
  };

  const revenueData = Object.entries(stock.quarterly_revenue_bn || {})
    .map(([date, val]) => ({ quarter: date, revenue: val }))
    .reverse();

  const sig = signalConfig[stock.signal] || signalConfig["Neutral"];
  const analyst = stock.analyst || {};
  const changePositive = stock.price_change_pct != null && stock.price_change_pct >= 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "technicals",   label: "Technicals" },
    { key: "fundamentals", label: "Fundamentals" },
    { key: "analysis",     label: "Analysis" },
    { key: "insider",      label: "Insider" },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800/60">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">{stock.ticker}</h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sig.classes} flex items-center gap-1`}>
                <span className="opacity-70 text-[10px]">{sig.icon}</span>
                {stock.signal}
              </span>
            </div>
            <p className="text-gray-500 text-sm truncate">{stock.company_name}</p>
            {stock.sector && (
              <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                {stock.sector}
              </span>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-3xl font-extrabold text-white font-mono">${num(stock.current_price)}</span>
            </div>
            {stock.price_change_pct != null && (
              <p className={`text-sm font-mono font-medium ${changePositive ? "text-emerald-400" : "text-red-400"}`}>
                {changePositive ? "+" : ""}{num(stock.price_change_pct)}%
                {stock.price_change != null && (
                  <span className="ml-1 opacity-70">({changePositive ? "+" : ""}{num(stock.price_change)})</span>
                )}
              </p>
            )}
            <p className="text-xs text-gray-600 mt-0.5 font-mono">{num(stock.pct_from_52w_high)}% from 52w high</p>
            <button
              onClick={addToWatchlist}
              disabled={watchlistStatus === "adding" || watchlistStatus === "added"}
              className={`mt-2 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                watchlistStatus === "added"
                  ? "border-emerald-700 text-emerald-500 bg-emerald-500/10"
                  : watchlistStatus === "error"
                  ? "border-red-700 text-red-400"
                  : "border-gray-700 text-gray-400 hover:border-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5"
              }`}
            >
              {watchlistStatus === "adding" ? "Adding…" :
               watchlistStatus === "added"  ? "✓ Watchlist" :
               watchlistStatus === "error"  ? "Error" : "+ Watchlist"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {/* Absolute Steal Banner */}
        {stock.is_absolute_steal && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-300 font-bold tracking-wide">🔥 ABSOLUTE STEAL</span>
              <span className="text-amber-500/70 text-xs">All conditions met</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.steal_conditions && Object.entries(stock.steal_conditions as Record<string, boolean>).map(([key, passed]) => {
                const labels: Record<string, string> = {
                  rsi_oversold: "RSI < 30", strong_signal: "Score ≥ 70", cheap_valuation: "P/E < 15",
                  growing_revenue: "Revenue+", low_leverage: "Low Debt",
                  dcf_undervalued: ">20% Below DCF", financially_healthy: "Piotroski ≥ 7",
                };
                return (
                  <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? "bg-amber-400/15 text-amber-300" : "bg-gray-800 text-gray-600"}`}>
                    {passed ? "✓" : "✗"} {labels[key] ?? key}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Overbought Warning */}
        {stock.is_overbought && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-red-300 font-bold tracking-wide">⚠ OVERBOUGHT</span>
              <span className="text-red-500/70 text-xs">Consider trimming</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.overbought_conditions && Object.entries(stock.overbought_conditions as Record<string, boolean>).map(([key, passed]) => {
                const labels: Record<string, string> = {
                  rsi_high: "RSI > 70", stoch_overbought: "Stoch > 80", near_upper_band: "Upper BB",
                  far_from_low: ">25% Above Low", high_valuation: "P/E > 35",
                };
                return (
                  <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? "bg-red-400/15 text-red-300" : "bg-gray-800 text-gray-600"}`}>
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
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm">
                <span>⚠️</span>
                <span className="text-yellow-300 font-medium">Earnings in {daysUntil} day{daysUntil !== 1 ? "s" : ""}</span>
                <span className="text-yellow-600 text-xs">({stock.next_earnings_date})</span>
              </div>
            );
          }
          return null;
        })()}

        {/* Score */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-400 font-medium">Oversold Score</span>
            <span className="font-mono font-bold text-white">{stock.oversold_score}<span className="text-gray-600">/100</span></span>
          </div>
          <ScoreBar score={stock.oversold_score} />
        </div>

        {/* Signal Reasons */}
        {stock.signal_reasons?.length > 0 && (
          <div className="mb-4 rounded-xl border border-gray-800 bg-gray-800/30 px-4 py-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
              Why {stock.signal}
            </p>
            <ul className="space-y-1.5">
              {(stock.signal_reasons as string[]).map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-300 animate-slide-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className={`mt-0.5 shrink-0 text-[10px] ${reasonColor[stock.signal] || "text-gray-500"}`}>›</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Analyst Consensus — always visible */}
        {analyst.rating != null && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-gray-800 bg-gray-800/30 px-4 py-2.5 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Analyst</span>
              <AnalystLabel rating={analyst.rating} />
              {analyst.count && <span className="text-xs text-gray-600">({analyst.count})</span>}
            </div>
            {analyst.target_mean && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-gray-500">Target</span>
                <span className="text-white font-semibold">${num(analyst.target_mean)}</span>
                {analyst.target_mean !== stock.current_price && (
                  <span className={analyst.target_mean > stock.current_price ? "text-emerald-400" : "text-red-400"}>
                    {analyst.target_mean > stock.current_price ? "+" : ""}
                    {((analyst.target_mean - stock.current_price) / stock.current_price * 100).toFixed(1)}%
                  </span>
                )}
                {analyst.target_low && analyst.target_high && (
                  <span className="text-gray-700">${num(analyst.target_low)}–${num(analyst.target_high)}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-800 mb-4">
          <div className="flex gap-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
                  activeTab === t.key
                    ? "text-emerald-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
                {activeTab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab: Technicals */}
        {activeTab === "technicals" && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-2 gap-x-6 mb-6">
              <div>
                <MetricRow
                  label="RSI (14)"
                  value={num(stock.technicals.rsi)}
                  color={stock.technicals.rsi < 30 ? "text-emerald-400" : stock.technicals.rsi > 70 ? "text-red-400" : "text-white"}
                />
                <MetricRow
                  label="MACD"
                  value={num(stock.technicals.macd, 4)}
                  color={stock.technicals.macd > stock.technicals.macd_signal ? "text-emerald-400" : "text-red-400"}
                />
                <MetricRow label="BB %" value={num(stock.technicals.bb_percent, 3)} />
                <MetricRow
                  label="Stoch %K"
                  value={num(stock.technicals.stoch_k)}
                  color={stock.technicals.stoch_k < 20 ? "text-emerald-400" : stock.technicals.stoch_k > 80 ? "text-red-400" : "text-white"}
                />
                <MetricRow label="Stoch %D" value={num(stock.technicals.stoch_d)} />
              </div>
              <div>
                <MetricRow
                  label="SMA 50"
                  value={stock.technicals.sma_50 ? `$${num(stock.technicals.sma_50)}` : "N/A"}
                  color={stock.technicals.sma_50 && stock.current_price < stock.technicals.sma_50 ? "text-red-400" : "text-white"}
                />
                <MetricRow
                  label="SMA 200"
                  value={stock.technicals.sma_200 ? `$${num(stock.technicals.sma_200)}` : "N/A"}
                  color={stock.technicals.sma_200 && stock.current_price < stock.technicals.sma_200 ? "text-red-400" : "text-white"}
                />
                {stock.technicals.golden_cross != null && (
                  <MetricRow
                    label="MA Cross"
                    value={
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${stock.technicals.golden_cross ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"}`}>
                        {stock.technicals.golden_cross ? "Golden" : "Death"}
                      </span>
                    }
                  />
                )}
                {stock.technicals.volume_ratio != null && (
                  <MetricRow
                    label="Volume Ratio"
                    value={`${num(stock.technicals.volume_ratio)}×`}
                    color={stock.technicals.volume_ratio > 2 ? "text-orange-400" : stock.technicals.volume_ratio > 1.5 ? "text-yellow-400" : "text-white"}
                  />
                )}
                {stock.technicals.obv_trend != null && (
                  <MetricRow
                    label="OBV Trend"
                    value={
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${stock.technicals.obv_trend === "rising" ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"}`}>
                        {stock.technicals.obv_trend === "rising" ? "↑ Rising" : "↓ Falling"}
                      </span>
                    }
                  />
                )}
                <MetricRow label="52w High" value={`$${num(stock.price_52w_high)}`} />
                <MetricRow label="52w Low"  value={`$${num(stock.price_52w_low)}`} />
              </div>
            </div>
            <PriceChart ticker={stock.ticker} />
          </div>
        )}

        {/* Tab: Fundamentals */}
        {activeTab === "fundamentals" && (
          <div className="animate-fade-in grid grid-cols-2 gap-x-6">
            <div>
              <MetricRow
                label="P/E Ratio"
                value={num(stock.fundamentals.pe_ratio)}
                color={stock.fundamentals.pe_ratio && stock.fundamentals.pe_ratio < 15 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="Forward P/E"
                value={num(stock.fundamentals.forward_pe)}
                color={stock.fundamentals.forward_pe && stock.fundamentals.forward_pe < 15 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="PEG Ratio"
                value={num(stock.fundamentals.peg_ratio)}
                color={
                  stock.fundamentals.peg_ratio == null ? "text-white" :
                  stock.fundamentals.peg_ratio < 1 ? "text-emerald-400" :
                  stock.fundamentals.peg_ratio > 2 ? "text-red-400" : "text-white"
                }
              />
              <MetricRow label="P/B Ratio" value={num(stock.fundamentals.pb_ratio)} />
              <MetricRow
                label="P/S Ratio"
                value={num(stock.fundamentals.ps_ratio)}
                color={stock.fundamentals.ps_ratio && stock.fundamentals.ps_ratio < 2 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="ROE"
                value={fmtPct(stock.fundamentals.roe)}
                color={stock.fundamentals.roe > 0.15 ? "text-emerald-400" : stock.fundamentals.roe < 0 ? "text-red-400" : "text-white"}
              />
              <MetricRow
                label="ROA"
                value={fmtPct(stock.fundamentals.roa)}
                color={stock.fundamentals.roa > 0.05 ? "text-emerald-400" : stock.fundamentals.roa < 0 ? "text-red-400" : "text-white"}
              />
              <MetricRow
                label="Dividend Yield"
                value={fmtPct(stock.fundamentals.dividend_yield)}
                color={stock.fundamentals.dividend_yield > 0.03 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="Beta"
                value={num(stock.fundamentals.beta)}
                color={stock.fundamentals.beta > 1.5 ? "text-orange-400" : "text-white"}
              />
              <MetricRow
                label="Short Interest"
                value={stock.fundamentals.short_percent_of_float != null ? `${num(stock.fundamentals.short_percent_of_float)}%` : "N/A"}
                color={
                  stock.fundamentals.short_percent_of_float == null ? "text-white" :
                  stock.fundamentals.short_percent_of_float > 20 ? "text-orange-400" :
                  stock.fundamentals.short_percent_of_float > 10 ? "text-yellow-400" : "text-white"
                }
              />
            </div>
            <div>
              <MetricRow
                label="Debt / Equity"
                value={num(stock.fundamentals.debt_to_equity)}
                color={stock.fundamentals.debt_to_equity > 200 ? "text-red-400" : "text-white"}
              />
              <MetricRow
                label="Revenue Growth"
                value={stock.fundamentals.revenue_growth != null ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%` : "N/A"}
                color={(stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}
              />
              <MetricRow
                label="Earnings Growth"
                value={stock.fundamentals.earnings_growth != null ? (Math.abs(stock.fundamentals.earnings_growth * 100) > 1000 ? "N/M" : `${(stock.fundamentals.earnings_growth * 100).toFixed(1)}%`) : "N/A"}
                color={(stock.fundamentals.earnings_growth ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}
              />
              <MetricRow
                label="Profit Margin"
                value={stock.fundamentals.profit_margin != null ? `${(stock.fundamentals.profit_margin * 100).toFixed(1)}%` : "N/A"}
                color={(stock.fundamentals.profit_margin ?? 0) > 0.1 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow label="Market Cap"   value={fmtMarketCap(stock.market_cap)} />
              <MetricRow
                label="DCF Value"
                value={stock.fundamentals.dcf_value ? `$${num(stock.fundamentals.dcf_value)}` : "N/A"}
                color={stock.fundamentals.dcf_value && stock.current_price < stock.fundamentals.dcf_value ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="EV / EBITDA"
                value={num(stock.fundamentals.ev_to_ebitda)}
                color={stock.fundamentals.ev_to_ebitda && stock.fundamentals.ev_to_ebitda < 8 ? "text-emerald-400" : "text-white"}
              />
              <MetricRow
                label="FCF Yield"
                value={stock.fundamentals.fcf_yield != null ? `${num(stock.fundamentals.fcf_yield)}%` : "N/A"}
                color={stock.fundamentals.fcf_yield > 5 ? "text-emerald-400" : stock.fundamentals.fcf_yield < 0 ? "text-red-400" : "text-white"}
              />
            </div>
          </div>
        )}

        {/* Tab: Insider Trading */}
        {activeTab === "insider" && (() => {
          const insider = stock.insider_activity || {};
          const transactions: any[] = insider.transactions || [];
          const signal: string = insider.signal || "neutral";
          const buyCount: number = insider.buy_count || 0;
          const sellCount: number = insider.sell_count || 0;
          const netShares: number = insider.net_shares || 0;

          const signalBadge =
            signal === "bullish"
              ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
              : signal === "bearish"
              ? "bg-red-400/10 text-red-400 border-red-400/30"
              : "bg-gray-700/50 text-gray-400 border-gray-700";

          const fmtShares = (n: number) =>
            Math.abs(n) >= 1_000_000
              ? `${(n / 1_000_000).toFixed(1)}M`
              : Math.abs(n) >= 1_000
              ? `${(n / 1_000).toFixed(1)}K`
              : String(n);

          const fmtValue = (v: number) =>
            v >= 1_000_000_000
              ? `$${(v / 1_000_000_000).toFixed(1)}B`
              : v >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
              ? `$${(v / 1_000).toFixed(0)}K`
              : `$${v}`;

          return (
            <div className="animate-fade-in space-y-4">
              {/* Summary row */}
              <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-800/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Insider Signal</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${signalBadge}`}>
                    {signal}
                  </span>
                </div>
                <div className="flex gap-4 text-xs font-mono">
                  <span className="text-emerald-400">{buyCount} buy{buyCount !== 1 ? "s" : ""}</span>
                  <span className="text-red-400">{sellCount} sale{sellCount !== 1 ? "s" : ""}</span>
                  {netShares !== 0 && (
                    <span className={netShares > 0 ? "text-emerald-400" : "text-red-400"}>
                      net {netShares > 0 ? "+" : ""}{fmtShares(netShares)} shares
                    </span>
                  )}
                </div>
              </div>

              {/* Transaction list */}
              {transactions.length === 0 ? (
                <p className="text-center text-gray-600 text-xs py-6">No insider transactions in the last 6 months</p>
              ) : (
                <div className="space-y-1">
                  {transactions.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          t.type === "buy" ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"
                        }`}>
                          {t.type === "buy" ? "BUY" : t.type === "sell" ? "SELL" : "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs text-white truncate">{t.insider || "Unknown"}</p>
                          {t.position && <p className="text-[10px] text-gray-500 truncate">{t.position}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.shares != null && (
                          <p className="text-xs font-mono text-gray-300">{fmtShares(t.shares)} shares</p>
                        )}
                        <div className="flex items-center gap-2 justify-end">
                          {t.value != null && (
                            <p className="text-[10px] font-mono text-gray-500">{fmtValue(t.value)}</p>
                          )}
                          {t.date && <p className="text-[10px] text-gray-600">{t.date}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-700 text-center">Source: SEC filings via Yahoo Finance · Last 6 months</p>
            </div>
          );
        })()}

        {/* Tab: Analysis */}
        {activeTab === "analysis" && (
          <div className="animate-fade-in space-y-6">
            {/* Piotroski */}
            {stock.piotroski?.score != null && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Piotroski F-Score</span>
                  <span className={`text-sm font-bold font-mono px-2.5 py-0.5 rounded-full ${
                    stock.piotroski.score >= 7 ? "bg-emerald-400/10 text-emerald-400" :
                    stock.piotroski.score <= 2 ? "bg-red-400/10 text-red-400" :
                    "bg-yellow-400/10 text-yellow-400"
                  }`}>
                    {stock.piotroski.score}/9 · {stock.piotroski.interpretation}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stock.piotroski.components as Record<string, boolean | null>).map(([key, passed]) => {
                    const labels: Record<string, string> = {
                      roa_positive: "ROA > 0", cfo_positive: "CFO > 0", roa_increasing: "ROA ↑",
                      accruals: "Cash Earnings", leverage_decreasing: "Debt ↓", liquidity_increasing: "Liquidity ↑",
                      no_dilution: "No Dilution", gross_margin_increasing: "Margin ↑", asset_turnover_increasing: "Turnover ↑",
                    };
                    if (passed === null) return null;
                    return (
                      <span key={key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${passed ? "bg-emerald-400/10 text-emerald-300" : "bg-gray-800 text-gray-600"}`}>
                        {passed ? "✓" : "✗"} {labels[key] ?? key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Score history — only shown once enough data points exist */}
            <ScoreHistoryChart ticker={stock.ticker} minPoints={7} />

            {/* Revenue chart */}
            {revenueData.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Quarterly Revenue (Bn)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={revenueData} barSize={28}>
                    <XAxis dataKey="quarter" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2937", borderRadius: "8px", fontSize: 12 }}
                      labelStyle={{ color: "#6b7280" }}
                      formatter={(val: any) => [`$${val}B`, "Revenue"]}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
