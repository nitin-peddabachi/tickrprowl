"use client";

import { useState, useEffect } from "react";
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

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      // ease-out curve: fast start, slow finish
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCount(Math.min(Math.round(target * progress), target));
      if (frame >= totalFrames) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function ScoreBar({ score }: { score: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 60);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
        style={{
          width: `${width}%`,
          background: "linear-gradient(to right, #ef4444, #f97316, #f59e0b, #84cc16, #10b981)",
          backgroundSize: "500px 100%",
        }}
      />
    </div>
  );
}

const TOOLTIPS: Record<string, string> = {
  // Technicals
  "RSI (14)":       "Relative Strength Index (14-day). Momentum oscillator on a 0–100 scale. Below 30 = oversold (potential buy signal), above 70 = overbought (potential sell signal).",
  "MACD":           "Moving Average Convergence Divergence. Difference between the 12-day and 26-day EMAs. Positive and above the signal line = bullish momentum.",
  "BB %":           "Bollinger Band %B — where price sits within the upper/lower bands. Below 0.1 = near lower band (oversold), above 0.9 = near upper band (overbought).",
  "Stoch %K":       "Stochastic Oscillator %K. Compares the close price to the recent high-low range. Below 20 = oversold, above 80 = overbought.",
  "Stoch %D":       "3-period moving average of %K. A %K crossover above %D is a bullish signal; crossing below is bearish.",
  "SMA 50":         "50-day Simple Moving Average. Price trading below the SMA 50 suggests a short-term downtrend.",
  "SMA 200":        "200-day Simple Moving Average. Price below the SMA 200 signals a long-term downtrend — a key bear market indicator.",
  "MA Cross":       "Moving average crossover. Golden Cross (SMA 50 > SMA 200) = long-term bullish. Death Cross (SMA 50 < SMA 200) = long-term bearish.",
  "Volume Ratio":   "Today's volume divided by the 20-day average volume. Above 1.5× = elevated interest; above 2× = unusually high activity, may signal a breakout or reversal.",
  "OBV Trend":      "On-Balance Volume trend. Rising OBV means volume is flowing into the stock (accumulation). Falling OBV signals distribution (selling pressure).",
  "RSI Divergence": "Bullish divergence: price makes a lower low but RSI makes a higher low. Signals weakening selling pressure and a potential reversal upward.",
  // Fundamentals
  "P/E Ratio":      "Price-to-Earnings (trailing). Share price divided by the last 12 months of EPS. Below 15 = historically cheap; above 25 = expensive.",
  "Forward P/E":    "Price divided by next 12 months of estimated EPS. Lower than trailing P/E implies analysts expect earnings growth.",
  "PEG Ratio":      "P/E divided by the earnings growth rate. Below 1 = potentially undervalued relative to growth. Above 2 = expensive for the growth on offer.",
  "P/B Ratio":      "Price-to-Book. Share price divided by net book value per share. Below 1 = trading below the liquidation value of assets.",
  "P/S Ratio":      "Price-to-Sales. Market cap divided by annual revenue. Below 2 = generally cheap; high P/S requires strong growth to justify.",
  "ROE":            "Return on Equity. Net income as a % of shareholder equity. Above 15% indicates strong management efficiency.",
  "ROA":            "Return on Assets. Net income as a % of total assets. Above 5% shows the company uses its assets efficiently to generate profit.",
  "Dividend Yield": "Annual dividend per share ÷ share price. Above 3% = meaningful income. Unusually high yields can signal a dividend at risk of being cut.",
  "Beta":           "Sensitivity to market moves. Beta > 1 = more volatile than the market; Beta < 1 = more stable. Negative Beta = moves inversely to the market.",
  "Short Interest":  "% of float sold short. Above 10% = elevated bearish sentiment. Above 20% = potential short squeeze if positive news drives a rapid rally.",
  "Debt / Equity":  "Total debt as a % of shareholder equity. High D/E means heavy financial leverage — magnifies gains but also losses and bankruptcy risk.",
  "Revenue Growth": "Year-over-year change in revenue. Confirms the business is expanding even if earnings are temporarily depressed.",
  "Earnings Growth":"Year-over-year change in EPS. Extreme values (shown as N/M) usually indicate one-time charges that distort the comparison.",
  "Profit Margin":  "Net income as a % of revenue. Above 10% = healthy. Declining margins signal cost pressure or pricing power erosion.",
  "Market Cap":     "Total market value of all outstanding shares (Price × Shares). Large cap > $10B, Mid cap $2–10B, Small cap < $2B.",
  "DCF Value":      "Discounted Cash Flow intrinsic value per share. Projects free cash flows 5 years out, discounts at 10%, adds a terminal value, then subtracts net debt. Green = price is below fair value.",
  "EV / EBITDA":    "Enterprise Value to EBITDA. Below 8 = potentially cheap. More comparable across companies with different capital structures than P/E.",
  "FCF Yield":      "Free Cash Flow ÷ Market Cap (%). Above 5% = good; above 8% = strong. Higher means more real cash generated per dollar of market value.",
};

function MetricRow({ label, value, color = "text-white", tooltip }: { label: string; value: React.ReactNode; color?: string; tooltip?: string }) {
  const tip = tooltip ?? TOOLTIPS[label];
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-800/50 last:border-0">
      <div className="relative group/tip flex items-center gap-1">
        <span className="text-gray-500 text-xs">{label}</span>
        {tip && (
          <>
            <span className="text-gray-700 text-[9px] cursor-help leading-none select-none">ⓘ</span>
            <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-50 w-56 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-[11px] text-gray-300 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 shadow-xl whitespace-normal">
              {tip}
            </div>
          </>
        )}
      </div>
      <span className={`font-mono text-xs font-medium ${color}`}>{value}</span>
    </div>
  );
}

function AnalystConsensus({ rating, count }: { rating: number; count?: number }) {
  const label =
    rating <= 1.5 ? { text: "Strong Buy", color: "text-emerald-400" } :
    rating <= 2.5 ? { text: "Buy", color: "text-green-400" } :
    rating <= 3.5 ? { text: "Hold", color: "text-yellow-400" } :
    rating <= 4.5 ? { text: "Underperform", color: "text-orange-400" } :
                   { text: "Sell", color: "text-red-400" };
  // marker position: rating 1 → 0%, rating 5 → 100%
  const pct = ((rating - 1) / 4) * 100;
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${label.color}`}>{label.text}</span>
          {count && <span className="text-[10px] text-gray-600">{count} analysts</span>}
        </div>
        <div className="relative h-1.5 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500">
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 border-gray-900 shadow"
            style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-gray-700 font-mono">
          <span>Buy</span><span>Hold</span><span>Sell</span>
        </div>
      </div>
    </div>
  );
}

type Tab = "technicals" | "fundamentals" | "analysis" | "insider";

export default function StockCard({ stock }: Props) {
  const [watchlistStatus, setWatchlistStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
  const animatedScore = useCountUp(stock.oversold_score);
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl">
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
            <span className="text-gray-400 font-medium cursor-help" title="Composite score (0–100) based on RSI, Bollinger Bands, distance from 52-week high, P/E, revenue growth, DCF undervaluation, FCF yield, and other factors. 70+ = Strong Buy, 50+ = Buy, 30+ = Watch.">Oversold Score</span>
            <span className="font-mono font-bold text-white">{animatedScore}<span className="text-gray-600">/100</span></span>
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
          <div className="mb-4 rounded-xl border border-gray-800 bg-gray-800/30 px-4 py-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest shrink-0">Analyst</span>
                <AnalystConsensus rating={analyst.rating} count={analyst.count} />
              </div>
              {analyst.target_mean && (
                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
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
          </div>
        )}

        {/* Quick Stats Strip */}
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg bg-gray-800/40 border border-gray-800 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Market Cap</p>
            <p className="text-xs font-mono font-semibold text-white">{fmtMarketCap(stock.market_cap)}</p>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-800 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">P/E Ratio</p>
            <p className="text-xs font-mono font-semibold text-white">{stock.fundamentals?.pe_ratio != null ? num(stock.fundamentals.pe_ratio) : "N/A"}</p>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-800 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Beta</p>
            <p className="text-xs font-mono font-semibold text-white">{stock.fundamentals?.beta != null ? num(stock.fundamentals.beta) : "N/A"}</p>
          </div>
          {/* 52w Range — visual slider bar */}
          <div className="rounded-lg bg-gray-800/40 border border-gray-800 px-3 py-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">52w Range</p>
            {stock.price_52w_low != null && stock.price_52w_high != null && stock.price_52w_high > stock.price_52w_low ? (() => {
              const pct = Math.min(Math.max(
                ((stock.current_price - stock.price_52w_low) / (stock.price_52w_high - stock.price_52w_low)) * 100,
                2), 98);
              return (
                <>
                  <div className="relative h-1 bg-gray-700 rounded-full mx-0.5 mt-1.5 mb-2">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/40 via-yellow-500/30 to-emerald-500/40" />
                    <div
                      className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-900 shadow"
                      style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-gray-600">
                    <span>${num(stock.price_52w_low, 0)}</span>
                    <span className="text-gray-500">{pct.toFixed(0)}%</span>
                    <span>${num(stock.price_52w_high, 0)}</span>
                  </div>
                </>
              );
            })() : (
              <p className="text-xs font-mono font-semibold text-white">N/A</p>
            )}
          </div>
        </div>

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
                <MetricRow
                  label="RSI Divergence"
                  value={
                    stock.rsi_divergence?.detected
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-400/10 text-emerald-400">✓ Bullish</span>
                      : <span className="text-gray-600 text-[10px]">None</span>
                  }
                />
              </div>
            </div>

            {stock.rsi_divergence?.detected && stock.rsi_divergence?.description && (
              <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 flex items-start gap-2">
                <span className="text-emerald-400 text-xs mt-0.5 shrink-0">↗</span>
                <p className="text-xs text-emerald-300">{stock.rsi_divergence.description}</p>
              </div>
            )}

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
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest" title="9-point financial health score by Joseph Piotroski. 7–9 = financially strong, 4–6 = moderate, 0–3 = weak (potential value trap).">Piotroski F-Score</span>
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
                    const tips: Record<string, string> = {
                      roa_positive:             "Return on Assets is positive — the company is profitable on an asset basis.",
                      cfo_positive:             "Cash Flow from Operations is positive — real cash earnings support reported income.",
                      roa_increasing:           "Return on Assets improved year-over-year — underlying profitability is strengthening.",
                      accruals:                 "Operating cash flow exceeds net income — earnings are backed by real cash, not accounting accruals.",
                      leverage_decreasing:      "Long-term debt as a fraction of assets decreased — the balance sheet is getting healthier.",
                      liquidity_increasing:     "Current ratio improved — the company is better positioned to cover short-term obligations.",
                      no_dilution:              "No new shares were issued — existing shareholders aren't being diluted.",
                      gross_margin_increasing:  "Gross profit margin increased — the core business is becoming more profitable per unit sold.",
                      asset_turnover_increasing:"Asset turnover ratio improved — the company generates more revenue per dollar of assets.",
                    };
                    if (passed === null) return null;
                    return (
                      <span key={key} title={tips[key]} className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${passed ? "bg-emerald-400/10 text-emerald-300" : "bg-gray-800 text-gray-600"}`}>
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
